import { useQuery } from "@tanstack/react-query";

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
    image: string;
    request: string;
  };
  architecture?: {
    modality: string;
    input_modalities?: string[];
    tokenizer: string;
    instruct_type: string;
  };
}

interface OpenRouterResponse {
  data: OpenRouterModel[];
}

export function useOpenRouterModels(apiKey?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["openrouter-models", apiKey],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers
      });

      if (!response.ok) {
        throw new Error("Failed to fetch OpenRouter models");
      }

      const data = (await response.json()) as OpenRouterResponse;

      // SOLO modelos multimodales: el extractor envía PDFs/imágenes, así que
      // un modelo de solo texto fallaría siempre. OpenRouter declara las
      // modalidades de entrada en architecture.input_modalities (o, en
      // modelos antiguos, en architecture.modality tipo "text+image->text").
      const isMultimodal = (m: OpenRouterModel) => {
        const inputs = m.architecture?.input_modalities;
        if (Array.isArray(inputs)) return inputs.includes("image") || inputs.includes("file");
        return /image|file|multimodal/i.test(m.architecture?.modality ?? "");
      };

      return data.data.filter(isMultimodal).sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: enabled,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}
