// Edge Function: comparar-versoes
//
// Recebe dois documentos (a versão anterior e a versão nova de um mesmo
// arquivo, cada um PDF ou foto) e usa a API da Anthropic (Claude Sonnet 5)
// pra comparar os dois e resumir o que mudou — usado no app "Planos de
// Ação" toda vez que uma nova versão de um documento é enviada. Roda no
// servidor pra manter a chave da API da Anthropic secreta (mesma chave já
// configurada no projeto Supabase pros outros Edge Functions deste
// workspace).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCHEMA_COMPARACAO = {
  type: "object",
  properties: {
    mudou: {
      type: "boolean",
      description: "true se há qualquer mudança perceptível de conteúdo entre as duas versões; false se são essencialmente idênticas (mudanças só de formatação/visual não contam como mudança).",
    },
    resumo: {
      type: "string",
      description:
        "Resumo curto (2 a 5 frases) do que mudou entre a versão anterior e a nova versão do documento. Foque em conteúdo — texto " +
        "alterado, números/valores diferentes, itens adicionados ou removidos, decisões novas — não em formatação ou diagramação. " +
        "Seja específico (cite o que mudou, não apenas 'o conteúdo foi atualizado'). Se 'mudou' for false, explique brevemente que " +
        "as versões são equivalentes.",
    },
  },
  required: ["mudou", "resumo"],
  additionalProperties: false,
};

const PROMPT =
  "O PRIMEIRO documento anexado é a VERSÃO ANTERIOR e o SEGUNDO é a VERSÃO NOVA do mesmo arquivo. Compare os dois e resuma o que " +
  "mudou entre eles, com foco em conteúdo (texto, números, itens, decisões) — ignore diferenças só de formatação/visual. Seja " +
  "específico sobre o que de fato mudou.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { arquivo_anterior_base64, media_type_anterior, arquivo_novo_base64, media_type_novo } = await req.json();
    if (!arquivo_anterior_base64 || !arquivo_novo_base64) {
      return jsonResponse({ error: "Campos arquivo_anterior_base64 e arquivo_novo_base64 são obrigatórios." }, 400);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "ANTHROPIC_API_KEY não configurada no servidor." }, 500);
    }

    const blocoArquivo = (base64: string, mediaType: string) => {
      const tipo = typeof mediaType === "string" && mediaType ? mediaType : "application/pdf";
      return tipo.startsWith("image/")
        ? { type: "image", source: { type: "base64", media_type: tipo, data: base64 } }
        : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };
    };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        output_config: { format: { type: "json_schema", schema: SCHEMA_COMPARACAO } },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              blocoArquivo(arquivo_anterior_base64, media_type_anterior),
              blocoArquivo(arquivo_novo_base64, media_type_novo),
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return jsonResponse({ error: data?.error?.message || "Erro ao chamar a API da Anthropic." }, 502);
    }

    if (data.stop_reason === "refusal") {
      return jsonResponse({ error: "O modelo recusou processar estes documentos." }, 422);
    }

    const textBlock = (data.content || []).find((b: { type: string }) => b.type === "text");
    if (!textBlock) {
      return jsonResponse({ error: "Resposta inesperada do modelo (sem texto)." }, 502);
    }

    const extraido = JSON.parse(textBlock.text);
    return jsonResponse({ data: extraido }, 200);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Erro desconhecido." }, 500);
  }
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}
