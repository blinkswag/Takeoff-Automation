import { GoogleGenAI, Type, Schema, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { ProjectSettings, AnalysisResult, SignageItem, SignTypeDefinition, KeyPage } from "../types";

// --- STATIC CONFIGURATIONS ---

const SYSTEM_INSTRUCTION = `
YOU ARE A DEDICATED “SIGNAGE TAKEOFF AGENT.”
Your mission is to perform 100% accurate signage extraction from architectural drawings and signage schedules.

PHASE 1: HOLISTIC PAGE READING & CONTEXT UNDERSTANDING (MANDATORY)
Before extracting any specific signs, you must "read" the visual documents entirely to understand the project context.
1. Scan the Title Blocks and Drawing Labels to understand the specific floor or area.
2. Read all "General Notes", "Signage Notes", or "Key Notes" visible on the page. These often contain rules like "All offices to have Type A signs" which overrides symbol counting.
3. Identify the building type (e.g., Medical, Educational, Office) to infer correct ADA and Wayfinding logic if explicit rules are missing.
4. Locate the Legend/Key on the sheet (or reference sheets) to strictly define Sign Type Codes (e.g., "S-1", "A-1") and their attributes (Dimensions, Color, Material).

PHASE 2: DATA EXTRACTION
1. EXTRACT SIGNAGE SCHEDULES (PRIORITY #1): 
   - If a tabular "Signage Schedule" or "Message Schedule" is present (on the current page or reference images), THIS IS THE SOURCE OF TRUTH. 
   - Extract every row from the schedule.
   - **CRITICAL**: Mark these items with "dataSource": "Schedule".
   - Extract: Location (Room #), Sign Type, Quantity, Message/Text, Size/Dimensions, Color, and Material.
   - Map "Message" content to the 'roomName'.
   - **CRITICAL LINKING**: If the Schedule lists a Sign Type (e.g., "Type A"), LOOK FOR THE VISUAL DEFINITION of "Type A" in the Reference Pages (Specification Sheets).

2. VISUAL PLAN EXTRACTION (PRIORITY #2):
   - Scan the Floor Plan for sign symbols.
   - **CRITICAL**: If you find a sign symbol on the plan that corresponds to a row in the Schedule, merge them (keep 'Schedule' as source).
   - **CRITICAL**: If you find a sign symbol that is **NOT** in the Schedule (an "extra" sign), you MUST extract it but mark it with "dataSource": "Visual".
   - If you generate a sign purely based on logic (e.g. "One per room rule") and not a symbol/schedule, mark with "dataSource": "Rule".

3. Cross-reference Sign Types: Match Type Codes found in the plan or schedule with the Sign Type Legend to populate the Catalog and individual item attributes.
   - If a sign type "A1" is defined in the legend with specific dimensions (e.g. 8"x8"), color, or material, propagate these values to every "A1" item in the takeoff.
   - SEARCH SPECIFICATIONS: Look for "Color", "Finish", "Material", "Substrate" fields in the sign type definition.

4. VISUAL DEFINITION EXTRACTION (MANDATORY):
   - You **MUST** identify a "Visual Definition" for every Sign Type in the Catalog.
   - **SOURCES**: Look in **Specification Pages**, **Reference Pages**, **Target Sheet Legends**, or **Signage Schedules** (Symbol Column).
   - **RESTRICTION**: **DO NOT** use the small location symbol on the floor plan map as the Visual Definition.
   - **BOUNDING BOX STRATEGY**:
     - Treat the "Visual Definition" as the **Sign Face + Dimensions**.
     - The box **MUST** capture the Sign Face (Pictogram, Icon, Text).
     - The box **MUST** extend to capture ALL adjacent **Dimension Lines**, **Extension Lines**, **Arrows**, and **Size Labels** (e.g. "6in", "8 inch", "V.I.F").
     - **DO NOT CROP OUT** the size text found next to the drawing.
     - Capture the full technical drawing block for the sign type.
   - **MATCHING**: 
     - Verify the text label (e.g. "Type A1") is physically close to the graphic.
     - **OPTIONAL**: If readable, compare text on the sign face with the schedule to confirm match, but prioritize the Sign Type Label.

CRITICAL ATTRIBUTE EXTRACTION RULES:
1. NOTES FIELD POPULATION (MANDATORY):
   - The 'notes' field MUST be comprehensive.
   - **Structure**: "Location/Message Info. [Specs: Material, Color, Mounting]".
   - **Legend Integration**: If the Legend says Type A is "Acrylic with Standoffs", this text MUST appear in the notes for every Type A sign.
   - Example: "Conf Rm 102. [Specs: 1/4'' Acrylic, Frosted, Standoff Mount]".

2. ADA COMPLIANCE (EVIDENCE-BASED ONLY):
   - You MUST set 'isADA' to TRUE *ONLY* if there is clear evidence in the sign definition, notes, or visual detail.
   - EVIDENCE 1 (TEXT): Keywords like "Braille", "Tactile", "Raised Characters", "Grade 2", "Gr. 2", "Accessible", "ADA", "Vision Impaired".
   - EVIDENCE 2 (VISUAL): A grid of dots (Braille) shown on the sign face, or the "International Symbol of Accessibility" (Wheelchair icon).
   - EVIDENCE 3 (MOUNTING/HEIGHT): If a note specifies mounting height "60 inches to center" or "Latch side", it *suggests* ADA, but look for Braille/Tactile to confirm.
   - DO NOT ASSUME based solely on room name.
   
3. PRECISE DIMENSIONS, DEPTH & LAYERS:
   - Read the dimension lines and callouts on the sign details carefully.
   - Extract Width, Height, AND Depth/Thickness if available (e.g. "8'' x 8'' x 1/8''").
   - Extract Layering info (e.g. "Second Surface", "Applied Panel", "Photopolymer", "1/4'' Acrylic backer") and include it in the 'material' or 'description' fields.

4. COLOR & MATERIAL EXTRACTION (STRICT):
   - Look for specific text describing the material (e.g., "Acrylic", "Aluminum", "Photopolymer", "Vinyl").
   - Look for specific text describing the color (e.g., "Blue", "P1", "White Text", "Satin Silver").
   - If found in the legend/schedule, apply it to all signs of that type.
   - If NOT found, return an empty string "". DO NOT GUESS.

CRITICAL OUTPUT FORMAT RULES:
- Output MUST be strictly valid JSON.
- STRICTLY FORBIDDEN: Do not use unescaped double quotes (") within string values.
- PREFERRED FOR DIMENSIONS: To prevent JSON syntax errors, DO NOT use the double quote symbol (") for inches. Use two single quotes ('') or the abbreviation 'in' instead.
  - INCORRECT: "dimensions": "8" x 8"" 
  - CORRECT: "dimensions": "8'' x 8''"
  - CORRECT: "dimensions": "8in x 8in"
- ESCAPE ALL other double quotes appearing within string values with a backslash.
- Do not use trailing commas.
- Do not write comments (// or /*) in the JSON.
- Do not use ellipsis (...) to truncate lists. Output ALL extracted items.
- If a value is unknown, use an empty string "", NOT null.
`;

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    takeoff: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sheet: { type: Type.STRING, description: "Sheet name or number" },
          roomNumber: { type: Type.STRING, description: "Room number found on plan or schedule. Return empty string if not found." },
          roomName: { type: Type.STRING, description: "Room name OR Sign Message text. Return empty string if not found." },
          signType: { type: Type.STRING, description: "Type code (e.g., A1, Type 1) or name. Return empty string if unknown." },
          isADA: { type: Type.BOOLEAN, description: "True ONLY if 'Braille', 'Tactile', 'Raised', 'Grade 2' is mentioned, or Wheelchair icon/Braille dots are explicitly visible. Do not assume." },
          quantity: { type: Type.NUMBER, description: "Count of signs" },
          dimensions: { type: Type.STRING, description: "Width x Height x Depth/Thickness (e.g. 6'' x 6'' x 1/8''). Return empty string if not found." },
          color: { type: Type.STRING, description: "Sign color/finish. Return empty string if not found." },
          material: { type: Type.STRING, description: "Material & Layer info (e.g. Acrylic with raised text, 2nd surface print). Return empty string if not found." },
          notes: { type: Type.STRING, description: "Combined Notes: Include specific location details AND a summary of sign specs (Color, Material, Mounting) if available." },
          boundingBox: { 
            type: Type.ARRAY, 
            items: { type: Type.NUMBER }, 
            description: "MANDATORY: Bounding box of the sign location on the FLOOR PLAN [ymin, xmin, ymax, xmax] 0-1000. Must be provided for every item." 
          },
          dataSource: {
             type: Type.STRING,
             enum: ['Schedule', 'Visual', 'Rule'],
             description: "Identify the source: 'Schedule' if found in a table, 'Visual' if found purely as a symbol on plan (and not in schedule), 'Rule' if generated by logic."
          }
        },
        required: ["sheet", "roomName", "signType", "quantity", "dimensions", "color", "material"],
      },
    },
    catalog: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          typeCode: { type: Type.STRING },
          category: { type: Type.STRING },
          description: { type: Type.STRING },
          dimensions: { type: Type.STRING, nullable: true },
          mounting: { type: Type.STRING, nullable: true },
          color: { type: Type.STRING, nullable: true },
          material: { type: Type.STRING, nullable: true },
          boundingBox: { 
             type: Type.ARRAY, 
             items: { type: Type.NUMBER }, 
             description: "MANDATORY: Bounding box of the VISUAL DEFINITION of this sign type. Must include the sign face PLUS dimension lines and labels. [ymin, xmin, ymax, xmax] 0-1000." 
          },
          imageIndex: {
             type: Type.NUMBER,
             description: "The index of the image where the visual definition is found (0 for first image, etc.)."
          }
        },
        required: ["typeCode", "category", "description"],
      },
    },
  },
  required: ["takeoff", "catalog"],
};

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- EXPORTED FUNCTIONS ---

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === "string") {
        const base64 = reader.result.split(",")[1];
        resolve(base64);
      } else {
        reject(new Error("Failed to process file"));
      }
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Scans the first few pages to find the Drawing List/Index and identify Key Pages.
 * Maps Sheet Numbers (e.g., A-101) to actual PDF Page Indices using strict logic to avoid the TOC itself.
 */
export const identifyKeyPages = async (
  firstFewPagesBase64: string[],
  pageTexts: string[] // Raw text of all pages to map Sheet Number -> Page Index
): Promise<KeyPage[]> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
    You are an architectural document analyzer. 
    Your job is to read the "Sheet Index", "Drawing List", or "Table of Contents" from the provided title sheet images.
    
    STRICTLY Identify ONLY pages containing the following keywords or concepts:
    - "Signage" (Exterior, Interior, Directional, Wayfinding)
    - "ADA" (Accessibility)
    - "Signage Schedule" or "Sign Schedule"
    - "Signage Specification" or "Sign Specification"
    - "Signage Design"
    - "Signage Details"
    
    Do NOT include:
    - Structural drawings
    - Mechanical/Electrical/Plumbing (unless explicitly labeled "Signage")
    - General Floor Plans (unless they are specific "Signage Plans")
    - Reflected Ceiling Plans (unless signage is primary)
    - General Legends (unless Signage Legend)
    
    Return a list of these key sheets with their Sheet Number (e.g. "A-101") and Description.
  `;

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      keySheets: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            sheetNumber: { type: Type.STRING },
            description: { type: Type.STRING },
            category: { type: Type.STRING, enum: ['Legend', 'Schedule', 'Detail', 'Floor Plan', 'General'] }
          },
          required: ["sheetNumber", "description", "category"]
        }
      }
    },
    required: ["keySheets"]
  };

  const parts: any[] = [];
  firstFewPagesBase64.forEach(b64 => {
    parts.push({ inlineData: { data: b64, mimeType: "image/jpeg" } });
  });
  parts.push({ text: "Find the Drawing Index and list all sheets strictly relevant to Signage, Legends, or Schedules." });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0,
        safetySettings: SAFETY_SETTINGS
      }
    });

    const text = response.text;
    if (!text) return [];
    
    const data = JSON.parse(text);
    const identified: any[] = data.keySheets || [];
    
    // Post-process: Map Sheet Numbers to Actual PDF Page Indices using the raw text index.
    // Logic improvement: Avoid matching the Sheet Index (Table of Contents) page itself.
    const keyPages: KeyPage[] = [];
    
    // The range of pages we scanned to find the Index (likely 0, 1, 2)
    const tocScanRange = firstFewPagesBase64.length; 

    for (const item of identified) {
      // Robust normalization: Remove spaces, dashes, dots to match 'A-101' against 'A101' or 'A.101'
      const searchStr = item.sheetNumber.replace(/[\s\-\.]/g, ''); 
      if (!searchStr) continue;

      // Find ALL occurrences of the sheet number in the document text
      const matches: number[] = [];
      for (let i = 0; i < pageTexts.length; i++) {
        const rawText = pageTexts[i].replace(/[\s\-\.]/g, ''); 
        if (rawText.includes(searchStr)) {
          matches.push(i);
        }
      }

      let bestIndex = -1;

      if (matches.length > 0) {
        // Strategy: 
        // 1. Prefer the LAST match in the document (Architectural sets often list Index first, Sheet later).
        const lastMatch = matches[matches.length - 1];
        
        // 2. Anti-Loop Logic:
        // If the LAST match found is STILL within the range of pages we scanned for the Index (e.g. pages 0-2),
        // and the document has more pages than that, then we likely only found the TOC entry itself.
        // It is better to return no link (-1) than to link back to the TOC.
        if (lastMatch < tocScanRange && pageTexts.length > tocScanRange) {
           bestIndex = -1;
        } else {
           bestIndex = lastMatch;
        }
      }
      
      if (bestIndex !== -1) {
        keyPages.push({
          sheetNumber: item.sheetNumber,
          description: item.description,
          category: item.category,
          pageIndex: bestIndex
        });
      }
    }
    
    return keyPages;

  } catch (e) {
    console.warn("Failed to identify key pages", e);
    return [];
  }
};

export const analyzeDrawing = async (
  fileBase64: string,
  mimeType: string,
  settings: ProjectSettings,
  fileName: string,
  referenceImages: string[] = [],
  pdfTextLayer?: string, // NEW: Optional text layer content from PDF
  signal?: AbortSignal // NEW: Abort signal for cancellation
): Promise<AnalysisResult> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey });

  // Combine all images into one list for the model's awareness of indices
  // Index 0..N-1: Reference Images
  // Index N: Target Image
  const allImages = [...referenceImages, fileBase64];
  const targetImageIndex = allImages.length - 1;

  let prompt = `
    Analyze the provided ${allImages.length} image(s) to generate a signage takeoff.
    
    IMAGE MAPPING GUIDE:
    ${referenceImages.map((_, i) => `- Image Index ${i}: Reference/Legend/Schedule Sheet (LOOK HERE FOR DESIGN VISUALS)`).join('\n')}
    - Image Index ${targetImageIndex}: TARGET SHEET (${fileName}) - Architectural Floor Plan.

    STEP 0: COMPREHENSIVE CONTEXT ANALYSIS
    - Read the entire content of ALL images.
    - Identify the drawing scale, key symbols, and Signage Schedule.
  `;

  // Inject PDF Text Layer if available
  if (pdfTextLayer) {
    prompt += `
    \n*** SUPPLEMENTAL TEXT LAYER DATA ***
    The following text was extracted directly from the PDF file layer of the TARGET SHEET. 
    Use this text to verify room numbers, notes, or sign codes that might be blurry in the image.
    PDF TEXT CONTENT:
    """
    ${pdfTextLayer.substring(0, 30000)} ... (truncated if too long)
    """
    *** END TEXT LAYER DATA ***
    `;
  }

  prompt += `
    STEP 1: EXTRACT SIGN TYPE CATALOG (VISUALS)
    - Scan ALL images (especially References) for the "Signage Legend" or "Sign Type Specifications".
    - For each Sign Type (e.g. "A1", "Exit"), extract its attributes (Dimensions, Color, Material).
    
    [CRITICAL VISUAL EXTRACTION - INCLUDE DIMENSIONS]
    - YOU MUST PROVIDE A 'boundingBox' FOR EVERY SIGN TYPE IN THE CATALOG.
    - **SOURCES**:
      1. **SPEC SHEETS (Images 0 to ${referenceImages.length - 1})**: Look for detailed drawings matching the Sign Type Code.
      2. **SCHEDULES**: If the Schedule on the target sheet has a "Visual" or "Symbol" column, use that.
      3. **SCHEDULE REFERENCES**: If the Schedule says "See Detail 5/A-501", and you have that page in references, look there.
      4. **LEGENDS**: Look for the Legend block on the Target Sheet (Image ${targetImageIndex}).
    - **SCOPE**: The box MUST encompass:
        1. The **Pictogram** / Icon / Text.
        2. The **Sign Frame** / Hardware.
        3. ALL surrounding **DIMENSION LINES** and **LABELS** that belong to this sign detail.
        4. **EXPAND THE BOX**: Deliberately include the text describing the size (e.g. '8"', '6"') even if it's offset from the frame.
    - **CROP INSTRUCTION**: The image MUST include the dimension guides. A crop of just the sign face without dimensions is INCOMPLETE.
    - **MATCHING**: 
        - Verify the text label (e.g. "Type A1") is physically close to the graphic.
        - **OPTIONAL CHECK**: If the text inside the visual design (e.g. "EXIT") is readable, compare it with the schedule data to confirm the match. Do NOT reject a clear Sign Type Label match if the copy text is blurry.
    - Provide the correct 'imageIndex' (Reference Index vs Target Index).
    
    [CRITICAL ADA & VISUAL CHECK - STRICT EVIDENCE REQUIRED]
    - PERFORM DEEP OCR ON SPEC NOTES: Read the text blocks and leader lines associated with each sign type illustration.
    - LOOK FOR KEYWORDS: "Braille", "Tactile", "Raised", "Grade 2", "Gr. 2", "ADA".
    - LOOK FOR VISUAL BRAILLE: Check for the grid of dots pattern on the sign face illustration.
    - LOOK FOR WHEELCHAIR ICON: If the "International Symbol of Accessibility" is visible, set isADA=true.
    - DO NOT MARK AS ADA UNLESS one of the above indicators is found. Do not assume based on room function alone.
    
    - LOOK FOR DEPTH/LAYERS: "Thickness", "Depth", "Layer", "Backer".
    - LOOK FOR MATERIAL/COLOR: Scan for "Acrylic", "Aluminum", "Photopolymer", "P1", "Blue", "White", etc.
    
    STEP 2: EXTRACT TAKEOFF FROM TARGET IMAGE (${fileName})
    - **PRIORITY**: If a Signage Schedule table is present, extract it fully. Set 'dataSource' = 'Schedule'.
    - **EXHAUSTIVE EXTRACTION**: EXTRACT EVERY SINGLE ROW from the schedule. Do not stop until all rows are read.
    - THEN, scan the plan for visual symbols.
      * If a symbol MATCHES a schedule row, assume it is covered by the schedule.
      * If a symbol is found visually but NOT in the schedule (an EXTRA sign), extract it and set 'dataSource' = 'Visual'.
      * Ensure these visual-only finds are marked clearly.
    - Generate the 'takeoff' list.
    - For each item, assign the correct 'signType'.
    - **MANDATORY**: Provide 'boundingBox' for the symbol location on the plan for ALL items.
    - **CRITICAL**: Automatically select the best extraction strategy (e.g. sweeping clockwise or reading schedules) based on the page layout.
    
    STEP 3: MAPPING
    - Ensure every 'takeoff' item has a 'signType' that exists in the 'catalog'.
    - **MANDATORY**: Populate the 'notes' field for every item with a combined string:
      * Format: "Notes/Message. [Specs: Material, Color, Mounting]".
      * Use data found in the legend.
  `;

  const parts: any[] = [];

  // Add all images to parts
  allImages.forEach((b64) => {
    parts.push({
      inlineData: {
        data: b64,
        mimeType: mimeType, 
      },
    });
  });

  parts.push({ text: prompt });

  let attempts = 0;
  const maxAttempts = 3;
  let lastError: any;

  while (attempts < maxAttempts) {
    if (signal?.aborted) {
      throw new Error("Analysis cancelled by user.");
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: parts,
        },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0, 
          maxOutputTokens: 65536,
          safetySettings: SAFETY_SETTINGS,
        },
      });

      // Check again after heavy lifting
      if (signal?.aborted) {
        throw new Error("Analysis cancelled by user.");
      }

      let text = response.text;
      
      // Fallback: manually extract text if .text getter fails or returns empty
      if (!text && response.candidates && response.candidates.length > 0) {
         const parts = response.candidates[0].content?.parts;
         if (parts) {
             text = parts.map(p => p.text || "").join("");
         }
      }

      if (!text && response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        if (candidate.finishReason === "MAX_TOKENS") {
          console.warn("Gemini output truncated due to MAX_TOKENS. Attempting to repair JSON.");
          if (!text) {
             throw new Error("Analysis stopped: MAX_TOKENS reached and no text generated.");
          }
        } else if (candidate.finishReason && candidate.finishReason !== "STOP") {
          throw new Error(`Analysis stopped: ${candidate.finishReason}`);
        }
      }

      if (!text) throw new Error("No data returned from Gemini.");

      // Parse with robust cleanup logic
      let result: AnalysisResult;
      try {
        const cleanedJson = cleanAndRepairJson(text);
        result = JSON.parse(cleanedJson) as AnalysisResult;
      } catch (parseError) {
        console.error("JSON Parse Failed. Raw Text:", text);
        throw new Error(`JSON Parse Failed: ${(parseError as Error).message}`);
      }

      // DEFENSIVE: Ensure arrays are initialized if missing or null
      // This prevents "Cannot read properties of undefined (reading 'forEach')" later in the app
      if (!result.takeoff || !Array.isArray(result.takeoff)) result.takeoff = [];
      if (!result.catalog || !Array.isArray(result.catalog)) result.catalog = [];

      // POST-PROCESSING: Crop Catalog Images & Map to Takeoff
      // This is also heavy, so check abort
      if (signal?.aborted) throw new Error("Analysis cancelled by user.");
      result = await processVisuals(result, allImages);

      return result; // Success, break loop

    } catch (error: any) {
      if (error.message.includes("cancelled by user")) {
        throw error; // Re-throw cancel immediately without retrying
      }

      lastError = error;
      const msg = error.message || "";
      console.warn(`Gemini Analysis Attempt ${attempts + 1} failed:`, msg);

      // Check if retriable
      if (
        msg.includes("500") || 
        msg.includes("503") || 
        msg.includes("Internal error") || 
        msg.includes("INTERNAL") || 
        msg.includes("Overloaded") ||
        msg.includes("No data returned")
      ) {
        attempts++;
        if (attempts < maxAttempts) {
          if (signal?.aborted) throw new Error("Analysis cancelled by user.");
          const waitTime = 1000 * Math.pow(2, attempts); // 2s, 4s, 8s
          console.log(`Retrying in ${waitTime}ms...`);
          await delay(waitTime);
          continue;
        }
      }
      
      // If not retriable or max attempts reached, throw
      throw new Error(`Analysis failed: ${msg}`);
    }
  }

  throw new Error(`Analysis failed after ${maxAttempts} attempts. Last error: ${lastError?.message}`);
};

/**
 * Robust JSON cleanup function to handle common LLM syntax errors,
 * truncation, and unbalanced brackets using a stack.
 */
function cleanAndRepairJson(text: string): string {
  // 1. Basic Cleanup
  text = text.trim();
  text = text.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");

  // 2. Find start of JSON
  const firstOpen = text.indexOf('{');
  if (firstOpen === -1) return "{}";

  // 3. Find the logical end of valid JSON content to discard trailing garbage/partial objects
  // We look for the last closing brace/bracket.
  let cutoff = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (cutoff === -1) {
     cutoff = text.length; 
  } else {
     cutoff += 1; // Include the closing char
  }
  
  let clean = text.substring(firstOpen, cutoff);

  // 4. Fix common internal syntax errors
  clean = clean.replace(/}\s*\{/g, "}, {"); // Missing comma between objects
  clean = clean.replace(/]\s*\[/g, "], ["); // Missing comma between arrays

  // 5. Remove trailing comma (if truncated right after a comma)
  clean = clean.trim();
  if (clean.endsWith(',')) {
      clean = clean.slice(0, -1);
  }

  // 6. Stack-Based Balancing
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    
    // Handle String state
    if (inString) {
      if (char === '\\' && !escaped) {
        escaped = true;
      } else if (char === '"' && !escaped) {
        inString = false;
      } else {
        escaped = false;
      }
      continue;
    }

    // Handle Structural chars
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      stack.push('}');
    } else if (char === '[') {
      stack.push(']');
    } else if (char === '}' || char === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === char) {
        stack.pop();
      }
    }
  }

  // 7. Close any open strings first
  if (inString) {
    clean += '"';
  }

  // 8. Append missing closing brackets/braces in reverse order (LIFO)
  while (stack.length > 0) {
    clean += stack.pop();
  }

  return clean;
}

/**
 * Enhanced Visual Processing:
 * 1. Cropping Catalog images from spec pages.
 * 2. Mapping Catalog images to Takeoff items.
 */
async function processVisuals(result: AnalysisResult, allImagesBase64: string[]): Promise<AnalysisResult> {
  // Pre-load all images into HTMLImageElements
  const loadedImages = await Promise.all(allImagesBase64.map(b64 => {
    return new Promise<HTMLImageElement>((resolve) => {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${b64}`;
      img.onload = () => resolve(img);
    });
  }));

  // 1. Process Catalog: Crop images for each type definition
  if (result.catalog && result.catalog.length > 0) {
    result.catalog = await Promise.all(result.catalog.map(async (typeDef) => {
      let imgIndex = typeDef.imageIndex;
      
      // Auto-correct index if only one image exists and model forgot to set it or set it invalid
      if (loadedImages.length === 1 && (imgIndex === undefined || imgIndex === null)) {
          imgIndex = 0;
      } else if (loadedImages.length > 1 && (imgIndex === undefined || imgIndex === null)) {
          // If multiple images but index undefined, fallback to target sheet (last one)
          imgIndex = loadedImages.length - 1;
      }

      if (
        typeDef.boundingBox && 
        typeDef.boundingBox.length === 4 && 
        typeof imgIndex === 'number' &&
        imgIndex >= 0 &&
        imgIndex < loadedImages.length
      ) {
        const img = loadedImages[imgIndex];
        // Use 20% padding to ensure dimension lines and labels are fully captured
        const designImage = await cropImage(img, typeDef.boundingBox, 0.20); 
        if (designImage) typeDef.designImage = designImage;
      }
      return typeDef;
    }));
  }

  // 2. Map Catalog Images to Takeoff Items with FUZZY MATCHING
  const normalize = (s: string) => s.toLowerCase().replace(/sign|type|[\s\-\.]/g, "");

  const designMap = new Map<string, string>();
  const fuzzyKeys = new Map<string, string>();

  // Defensive loop in case catalog is somehow undefined
  (result.catalog || []).forEach(c => {
    if (c.designImage) {
      designMap.set(c.typeCode.toLowerCase(), c.designImage);
      if (c.description) designMap.set(c.description.toLowerCase(), c.designImage);
      if (c.typeCode) fuzzyKeys.set(normalize(c.typeCode), c.designImage);
    }
  });

  // 3. Process Takeoff Items (Map Match ONLY - NO FLOOR PLAN SYMBOL FALLBACK)
  if (result.takeoff && result.takeoff.length > 0) {
    result.takeoff = await Promise.all(result.takeoff.map(async (item) => {
      // A. Try Exact Match
      const key = item.signType.toLowerCase();
      if (designMap.has(key)) {
        item.designImage = designMap.get(key);
        return item;
      }

      // B. Try Fuzzy Match
      const normKey = normalize(item.signType);
      if (fuzzyKeys.has(normKey)) {
          item.designImage = fuzzyKeys.get(normKey);
          return item;
      }
      // Partial Fuzzy Match
      for (const [fKey, img] of fuzzyKeys.entries()) {
          if (normKey.includes(fKey) || fKey.includes(normKey)) {
              item.designImage = img;
              break;
          }
      }
      
      return item;
    }));
  }

  return result;
}

// Helper: Crop Image from Canvas
export function cropImage(img: HTMLImageElement, bbox: number[], paddingPct: number): Promise<string | undefined> {
  return new Promise((resolve) => {
      const [ymin, xmin, ymax, xmax] = bbox;
      const paddingX = (xmax - xmin) * paddingPct;
      const paddingY = (ymax - ymin) * paddingPct;

      let pixelX = ((xmin - paddingX) / 1000) * img.width;
      let pixelY = ((ymin - paddingY) / 1000) * img.height;
      let pixelW = ((xmax + paddingX) / 1000) * img.width - pixelX;
      let pixelH = ((ymax + paddingY) / 1000) * img.height - pixelY;

      pixelX = Math.max(0, pixelX);
      pixelY = Math.max(0, pixelY);
      pixelW = Math.min(img.width - pixelX, pixelW);
      pixelH = Math.min(img.height - pixelY, pixelH);

      // Sanity check for invalid 0-size crops
      if (pixelW <= 0 || pixelH <= 0) {
          resolve(undefined);
          return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = pixelW;
      canvas.height = pixelH;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(img, pixelX, pixelY, pixelW, pixelH, 0, 0, pixelW, pixelH);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } else {
        resolve(undefined);
      }
  });
}