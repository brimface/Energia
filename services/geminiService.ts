import { GoogleGenAI, Type } from "@google/genai";
import { BillData } from "../types";

export const extractBillData = async (fileBase64: string, mimeType: string): Promise<BillData> => {
  // Initialize explicitly inside the function to prevent app crash on load if env is missing
  // This allows the UI to render and show a graceful error later if the key is invalid.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const prompt = `
      Analise esta fatura de eletricidade portuguesa. Extraia os seguintes dados com precisão para formato JSON:
      
      1. Consumo mensal total em kWh (soma de vazio, cheia, ponta se for bi/tri-horário, ou simples).
      2. Potência Contratada (kVA).
      3. Valor da Contribuição Audiovisual (CAV).
      4. Valor da Taxa de Exploração DGEG.
      5. Valor do Imposto Especial de Consumo (IEC ou IECE).
      6. Valor da Tarifa Social (se existir, devolva como número negativo. Se não existir ou for 0, devolva 0).
      7. Valor Total da Fatura (Total a Pagar).
      8. Número de dias do período de faturação (assuma 30 se não encontrar).
      
      9. Preço unitário da potência (€/dia) atual. 
         IMPORTANTE: Verifique atentamente se existe algum desconto comercial aplicado sobre a potência (ex: "Desconto X%", "Desconto Plano", ou valor negativo associado à potência). 
         Se houver, devolva o valor unitário LÍQUIDO (Preço Base - Desconto).
      
      10. Preço unitário da energia (€/kWh) atual. 
          IMPORTANTE: Verifique atentamente se existe algum desconto comercial aplicado sobre o consumo/energia (ex: "Desconto X%", "Desconto de Plano", ou linha de crédito na energia). 
          Se houver, calcule o valor final por kWh (Preço Base - Valor do Desconto por kWh). 
          Se for bi-horário ou tri-horário, calcule a média ponderada do preço final.

      Se algum imposto não for encontrado explicitamente, assuma 0.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: fileBase64
            }
          },
          {
            text: prompt
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            monthlyConsumptionKwh: { type: Type.NUMBER, description: "Total monthly consumption in kWh" },
            contractedPowerKva: { type: Type.NUMBER, description: "Contracted power in kVA (e.g., 3.45, 6.9)" },
            audiovisualTax: { type: Type.NUMBER, description: "Contribuição Audiovisual (CAV) cost in Euros" },
            dgegTax: { type: Type.NUMBER, description: "Taxa Exploração DGEG cost in Euros" },
            ieceTax: { type: Type.NUMBER, description: "Imposto Especial Consumo (IEC) cost in Euros" },
            socialTariff: { type: Type.NUMBER, description: "Social Tariff discount in Euros (negative value)" },
            totalAmount: { type: Type.NUMBER, description: "Total bill amount in Euros" },
            billingPeriodDays: { type: Type.NUMBER, description: "Number of billing days" },
            currentPowerPricePerDay: { type: Type.NUMBER, description: "Current effective price per day for power (after discounts)" },
            currentEnergyPricePerKwh: { type: Type.NUMBER, description: "Current effective price per kWh for energy (after discounts)" }
          },
          required: ["monthlyConsumptionKwh", "contractedPowerKva", "totalAmount"]
        }
      }
    });

    if (!response.text) {
      throw new Error("No data returned from Gemini");
    }

    const data = JSON.parse(response.text) as BillData;
    return data;
  } catch (error) {
    console.error("Error extracting bill data:", error);
    throw error;
  }
};