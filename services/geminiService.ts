import { GoogleGenAI, Type } from "@google/genai";
import { RawEntity, RawRelation } from "../types";

const SYSTEM_INSTRUCTION = `
你是一位构建知识图谱的专家，尤其擅长中医（TCM）和医学文本的处理。
你的任务是从非结构化文本中提取实体和关系。

规则：
1. 识别不同的实体（例如：具体的疾病、症状、草药、方剂、证候）。
2. 识别它们之间的关系（例如：治疗、引起、是...的症状、包含、属于）。
3. 必须以严格的JSON格式返回数据。
4. 实体类型（type）和关系（relation）尽量使用简洁的中文术语。
`;

export const extractGraphFromText = async (text: string): Promise<{ entities: RawEntity[], relations: RawRelation[] }> => {
  if (!process.env.API_KEY) {
    throw new Error("缺少 API Key");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `请从以下文本中提取知识图谱数据:\n\n${text}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            entities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, description: "实体的类别 (例如 '疾病', '症状', '方剂')" },
                  name: { type: Type.STRING, description: "实体的唯一名称" }
                },
                required: ["type", "name"]
              }
            },
            relations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  source: { type: Type.STRING, description: "源实体名称" },
                  relation: { type: Type.STRING, description: "关系类型 (例如 '治疗', '归经')" },
                  target: { type: Type.STRING, description: "目标实体名称" }
                },
                required: ["source", "relation", "target"]
              }
            }
          }
        }
      }
    });

    const resultText = response.text;
    if (!resultText) return { entities: [], relations: [] };

    const parsed = JSON.parse(resultText);
    return {
      entities: parsed.entities || [],
      relations: parsed.relations || []
    };

  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
};