
import { GoogleGenAI, Type } from "@google/genai";
import { Student, calculateAttendanceWeight, User, calculateCatechistRate, ParishEvent, calculateStudentRate } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const handleApiError = (error: any) => {
    console.error("Gemini API Error:", error);
    if (error?.message?.includes("RESOURCE_EXHAUSTED") || error?.status === 429) {
        return "Lo sentimos, se ha excedido la cuota gratuita de la IA por ahora. Por favor, inténtalo de nuevo en unos minutos.";
    }
    return "Ocurrió un error al procesar la solicitud con la IA.";
};

export const generateAttendanceReport = async (students: Student[]) => {
  try {
    const studentSummary = students.map(s => {
      const records = s.attendanceHistory.length;
      const catPresent = s.attendanceHistory.filter(h => h.catechism === 'present').length;
      const massPresent = s.attendanceHistory.filter(h => h.mass === 'present').length;
      
      return `- ${s.name} (${s.school}): ${records} días registrados. Presencia Catequesis: ${catPresent}, Presencia Misa: ${massPresent}.`;
    }).join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Eres el Coordinador de Catequesis de la Parroquia San Pascual Baylón. Analiza detenidamente estos datos de asistencia de los niños (catecúmenos):
      
      ${studentSummary}
      
      INSTRUCCIONES:
      1. Identifica a los niños con asistencia perfecta o excelente y destaca el valor de su compromiso.
      2. Identifica patrones preocupantes (ej. niños que vienen a catequesis pero se saltan la misa o viceversa).
      3. Señala a los niños en riesgo de abandono.
      4. Proporciona recomendaciones pastorales ESPECÍFICAS para estos casos, no consejos genéricos. Menciona nombres propios en el análisis para que el informe sea útil y real.
      5. El tono debe ser profesional, cercano y orientado a la misión evangelizadora de la parroquia.`,
      config: {
        temperature: 0.7,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            recommendations: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["summary", "recommendations"]
        }
      }
    });

    const text = response.text?.trim() || '{"summary": "No se pudo extraer el texto de la respuesta", "recommendations": []}';
    return JSON.parse(text);
  } catch (error) {
    return {
      summary: handleApiError(error),
      recommendations: ["Espera unos minutos", "Comprueba tu conexión", "Contacta con soporte técnico si el problema persiste"]
    };
  }
};

export const generateCatechistReport = async (catechists: User[], classDays: string[], events: ParishEvent[]) => {
  try {
    const catechistSummary = catechists.map(c => {
      const rate = calculateCatechistRate(c, classDays, events);
      return `${c.name}: ${rate}% de asistencia total (clases + eventos).`;
    }).join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Como coordinador de la Parroquia San Pascual Baylón, analiza la participación del equipo de catequistas:
      ${catechistSummary}
      
      Genera un informe que valore el compromiso del equipo, destaque a los más constantes y sugiera formas de motivar a los que tienen menor participación, siempre con un tono pastoral y de agradecimiento por su labor voluntaria. Menciona nombres específicos y situaciones detectadas.`,
      config: {
        temperature: 0.7,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            recommendations: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["summary", "recommendations"]
        }
      }
    });

    const text = response.text?.trim() || '{"summary": "No se pudo extraer el texto de la respuesta", "recommendations": []}';
    return JSON.parse(text);
  } catch (error) {
    return {
      summary: handleApiError(error),
      recommendations: ["Error de cuota de IA excedida", "Pruebe más tarde"]
    };
  }
};

export const draftParentEmail = async (studentName: string, date: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Redacta un correo amable de la Parroquia San Pascual Baylón para los padres de ${studentName} informándoles que hoy, ${date}, no ha asistido. Tono acogedor.`,
    });
    return response.text || '';
  } catch (error) {
    console.error(error);
    return `Estimados padres de ${studentName}, les informamos que su hijo/a no ha asistido a la catequesis hoy ${date}. Un saludo cordial de la Parroquia.`;
  }
};
