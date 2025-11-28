import { GoogleGenAI, Type, Schema, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { ProjectSettings, AnalysisResult } from "../types";

// --- STATIC CONFIGURATIONS (Moved out of function scope for performance) ---

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
   - **TARGET**: The detailed **Pictogram**, Elevation Drawing, or Sketch in the Legend/Specs.
   - **CONTENT**: The bounding box must capture:
     1. The Sign Face (Pictogram, Icon, Text, Braille dots).
     2. The Mounting Hardware (if visible).
     3. **CRITICAL**: All adjacent **Dimension Lines**, **Arrows**, and **Size Labels** (e.g. "6in", "V.I.F").
   - **FALLBACK**: If no legend detail exists, find a CLEAR symbol on the Floor Plan.
   - Return the 'boundingBox' [ymin, xmin, ymax, xmax] (0-1000 scale) and 'imageIndex'.
   - We use this to crop and show the user the "Design" of the sign.

CRITICAL ATTRIBUTE EXTRACTION RULES:
1. NOTES FIELD POPULATION (MANDATORY):
   - The 'notes' field MUST be comprehensive.
   - **Structure**: "Location/Message Info. [Specs: Material, Color, Mounting]".
   - **Legend Integration**: If the Legend says Type A is "Acrylic with Standoffs", this text MUST appear in the notes for every Type A sign.
   - Example: "Conf Rm 102. [Specs: 1/4'' Acrylic, Frosted, Standoff Mount]".
   - **DO NOT** leave notes blank if specification info exists in the legend.

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
            description: "MANDATORY: Bounding box of the sign location on the FLOOR PLAN [ymin, xmin, ymax, xmax] 0-1000. Must be provided for every item to enable thumbnails." 
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
             description: "MANDATORY: Bounding box of the VISUAL DEFINITION of this sign type. [ymin, xmin, ymax, xmax] 0-1000." 
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

export const analyzeDrawing = async (
  fileBase64: string,
  mimeType: string,
  settings: ProjectSettings,
  fileName: string,
  referenceImages: string[] = []
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
    
    IMAGE INDEX GUIDE:
    ${referenceImages.map((_, i) => `- Image ${i}: Reference/Legend/Schedule`).join('\n')}
    - Image ${targetImageIndex}: TARGET SHEET (${fileName}) - Architectural Floor Plan.

    STEP 0: COMPREHENSIVE CONTEXT ANALYSIS
    - Read the entire content of ALL images.
    - Identify the drawing scale, key symbols, and Signage Schedule.
    
    STEP 1: EXTRACT SIGN TYPE CATALOG (VISUALS)
    - Scan ALL images (especially References) for the "Signage Legend" or "Sign Type Specifications".
    - For each Sign Type (e.g. "A1", "Exit"), extract its attributes (Dimensions, Color, Material).
    
    [CRITICAL VISUAL EXTRACTION - PICTOGRAM & DIMENSIONS]
    - YOU MUST PROVIDE A 'boundingBox' FOR EVERY SIGN TYPE IN THE CATALOG.
    - **PREFERRED**: Use the Detail Drawing in the Specs/Legend. 
    - **SCOPE**: The box MUST encompass:
        1. The **Pictogram** / Icon / Text.
        2. The **Sign Frame** / Hardware.
        3. ALL surrounding **DIMENSION LINES** and **LABELS**.
    - **DO NOT** crop too tightly. It is better to include a bit of extra whitespace than to cut off dimensions or notes.
    - **FALLBACK**: If no Spec drawing exists, FIND A CLEAR SYMBOL ON THE FLOOR PLAN (Image ${targetImageIndex}) and use that as the visual definition (bbox + imageIndex).
    - Provide the correct 'imageIndex'.
    
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
    - THEN, scan the plan for visual symbols.
      * If a symbol MATCHES a schedule row, assume it is covered by the schedule.
      * If a symbol is found visually but NOT in the schedule (an EXTRA sign), extract it and set 'dataSource' = 'Visual'.
      * Ensure these visual-only finds are marked clearly.
    - Generate the 'takeoff' list.
    - For each item, assign the correct 'signType'.
    - **MANDATORY**: Provide 'boundingBox' for the symbol location on the plan for ALL items. We use this to show thumbnails if the catalog visual is missing.
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

      let text = response.text;
      
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

      // POST-PROCESSING: Crop Catalog Images & Map to Takeoff
      result = await processVisuals(result, allImages);

      return result; // Success, break loop

    } catch (error: any) {
      lastError = error;
      const msg = error.message || "";
      console.warn(`Gemini Analysis Attempt ${attempts + 1} failed:`, msg);

      // Check if retriable
      if (
        msg.includes("500") || 
        msg.includes("503") || 
        msg.includes("Internal error") || 
        msg.includes("INTERNAL") ||
        msg.includes("Overloaded")
      ) {
        attempts++;
        if (attempts < maxAttempts) {
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
 * Enhanced Visual Processing:
 * 1. Cropping Catalog images from spec pages.
 * 2. Mapping Catalog images to Takeoff items.
 * 3. Fallback: Cropping symbol images from the Floor Plan if Catalog image is missing.
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

  const targetImg = loadedImages[loadedImages.length - 1]; // The floor plan is always last

  // 1. Process Catalog: Crop images for each type definition
  if (result.catalog && result.catalog.length > 0) {
    result.catalog = await Promise.all(result.catalog.map(async (typeDef) => {
      let imgIndex = typeDef.imageIndex;
      
      // Auto-correct index if only one image exists and model forgot to set it or set it invalid
      if (loadedImages.length === 1 && (imgIndex === undefined || imgIndex === null)) {
          imgIndex = 0;
      }

      if (
        typeDef.boundingBox && 
        typeDef.boundingBox.length === 4 && 
        typeof imgIndex === 'number' &&
        imgIndex >= 0 &&
        imgIndex < loadedImages.length
      ) {
        const img = loadedImages[imgIndex];
        // Use 15% padding for spec details to catch dimensions and surrounding context
        const designImage = await cropImage(img, typeDef.boundingBox, 0.15); 
        if (designImage) typeDef.designImage = designImage;
      }
      return typeDef;
    }));
  }

  // 2. Map Catalog Images to Takeoff Items with FUZZY MATCHING
  const normalize = (s: string) => s.toLowerCase().replace(/sign|type|[\s\-\.]/g, "");

  const designMap = new Map<string, string>();
  const fuzzyKeys = new Map<string, string>();

  (result.catalog || []).forEach(c => {
    if (c.designImage) {
      designMap.set(c.typeCode.toLowerCase(), c.designImage);
      if (c.description) designMap.set(c.description.toLowerCase(), c.designImage);
      if (c.typeCode) fuzzyKeys.set(normalize(c.typeCode), c.designImage);
    }
  });

  // 3. Process Takeoff Items (Map Match or Fallback Crop)
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
      if (item.designImage) return item;

      // C. FALLBACK: Crop from Plan (Symbol) if BoundingBox exists
      if (item.boundingBox && item.boundingBox.length === 4 && targetImg) {
          const symbolImage = await cropImage(targetImg, item.boundingBox, 0.20); // 20% padding for symbols to capture context/text
          if (symbolImage) item.designImage = symbolImage;
      }
      
      return item;
    }));
  }

  return result;
}

// Helper: Crop Image from Canvas
function cropImage(img: HTMLImageElement, bbox: number[], paddingPct: number): Promise<string | undefined> {
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