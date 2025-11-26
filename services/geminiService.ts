import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ProjectSettings, AnalysisResult } from "../types";

const SYSTEM_INSTRUCTION = `
YOU ARE A DEDICATED “SIGNAGE TAKEOFF AGENT.”
Your mission is to perform 100% accurate signage extraction from architectural drawings.

Your responsibilities:
1. Read and interpret architectural drawings (Room names, numbers, restroom labels, stair labels, directional arrows, exit indicators).
2. Create a structured signage takeoff based on the user's configuration rules.
3. Build a Signage Type Catalog based on standard architectural requirements or a provided legend.

Standard Rules (unless overridden by user config):
- Rule A: Every room name = 1 Room ID Sign.
- Rule B: ADA Restroom Signs = One combined sign (Raised text + Braille) per restroom.
- Rule C: Identify all exit points (Stairs, Exterior, Corridors).
- Rule D: Exterior doors get 1 number inside, 1 number outside.
- Rule E: Capture all directional signs (Wayfinding arrows).
- Rule F: Stairs require Stair ID + Floor Level ID.
- Rule G: Sliding Bar signs for Staff, Offices, Custodial, Privacy rooms.

Output must be strict JSON.
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
          roomNumber: { type: Type.STRING, description: "Room number found on plan" },
          roomName: { type: Type.STRING, description: "Room name found on plan" },
          signType: { type: Type.STRING, description: "Type code or name (e.g., A1, Room ID)" },
          isADA: { type: Type.BOOLEAN, description: "Is this an ADA compliant sign?" },
          quantity: { type: Type.NUMBER, description: "Count of signs" },
          notes: { type: Type.STRING, description: "Location reference or special notes" },
        },
        required: ["sheet", "roomName", "signType", "quantity"],
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
        },
        required: ["typeCode", "category", "description"],
      },
    },
  },
  required: ["takeoff", "catalog"],
};

export const analyzeDrawing = async (
  fileBase64: string,
  mimeType: string,
  settings: ProjectSettings,
  fileName: string
): Promise<AnalysisResult> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    Analyze this architectural drawing image (${fileName}).
    
    Apply the following specific extraction rules based on user configuration:
    - Extraction Mode: ${settings.extractionMode}
    - Rule A (One Sign Per Room): ${settings.ruleA_OneSignPerRoom ? "ACTIVE" : "INACTIVE"}
    - Rule B (Combined ADA Signs): ${settings.ruleB_CombinedADASigns ? "ACTIVE" : "INACTIVE"}
    - Rule C (Identify Exits): ${settings.ruleC_IdentifyExits ? "ACTIVE" : "INACTIVE"}
    - Rule D (Exterior Door Numbers): ${settings.ruleD_ExteriorDoorNumbers ? "ACTIVE" : "INACTIVE"}
    - Rule E (Include Directionals): ${settings.ruleE_IncludeDirectionals ? "ACTIVE" : "INACTIVE"}
    - Rule F (Stair Signage): ${settings.ruleF_StairSignage ? "ACTIVE" : "INACTIVE"}
    - Rule G (Sliding Bar Signs): ${settings.ruleG_SlidingBarSigns ? "ACTIVE" : "INACTIVE"}

    Please extract every potential sign location visible in this image segment.
    Return the data in the specified JSON structure.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              data: fileBase64,
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2, // Low temperature for factual extraction
      },
    });

    const text = response.text;
    if (!text) throw new Error("No data returned from Gemini");

    return JSON.parse(text) as AnalysisResult;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === "string") {
        // Remove the "data:image/xxx;base64," prefix
        const base64 = reader.result.split(",")[1];
        resolve(base64);
      } else {
        reject(new Error("Failed to process file"));
      }
    };
    reader.onerror = (error) => reject(error);
  });
};
