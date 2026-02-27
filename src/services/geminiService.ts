import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

export interface ScannedItem {
  name: string;
  category: string;
  price: number;
  quantity: number;
}

export async function scanImages(base64Images: string[]): Promise<ScannedItem[]> {
  const model = "gemini-3-flash-preview";
  
  const imageParts = base64Images.map(img => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: img.split(",")[1] || img,
    },
  }));

  const prompt = `
    Analise estas imagens de joias/semijoias e extraia uma lista consolidada de todos os itens visíveis.
    Para cada item, identifique:
    - Nome (ex: Brinco Argola Ouro)
    - Categoria (brinco, anel, pulseira, corrente)
    - Preço unitário (apenas o número)
    - Quantidade (se visível, senão 1)

    Retorne APENAS um array JSON de objetos com as propriedades: name, category, price, quantity.
    Exemplo: [{"name": "Brinco Ouro", "category": "brinco", "price": 450, "quantity": 1}]
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: prompt },
          ...imageParts
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            category: { type: Type.STRING },
            price: { type: Type.NUMBER },
            quantity: { type: Type.NUMBER },
          },
          required: ["name", "category", "price", "quantity"],
        },
      },
    },
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Error parsing Gemini response:", e);
    return [];
  }
}

export async function scanText(text: string): Promise<ScannedItem[]> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Analise o seguinte texto e identifique uma lista de joias/semijoias com seus preços e quantidades.
    Texto: "${text}"

    Retorne APENAS um array JSON de objetos com as propriedades: name, category, price, quantity.
    Categorias permitidas: brinco, anel, pulseira, corrente.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            category: { type: Type.STRING },
            price: { type: Type.NUMBER },
            quantity: { type: Type.NUMBER },
          },
          required: ["name", "category", "price", "quantity"],
        },
      },
    },
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Error parsing Gemini response:", e);
    return [];
  }
}
