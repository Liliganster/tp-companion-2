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
      
      // Filter for models that likely support vision/multimodal (JSON extraction)
      // OpenRouter doesn't always have a strict binary flag for vision, but we sort alphabetically
      return data.data.sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: enabled,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}
