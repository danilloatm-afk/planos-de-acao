// Edge Function: extract-plano-acao
//
// Recebe um documento (PDF ou foto) em base64 e usa a API da Anthropic
// (Claude Sonnet 5) pra ler o conteúdo e sugerir um plano de ação
// estruturado em etapas — usado ao criar um projeto novo no app "Planos de
// Ação" anexando um documento em vez de digitar tudo na mão. Roda no
// servidor pra manter a chave da API da Anthropic secreta (mesma chave já
// configurada no projeto Supabase pros outros Edge Functions deste
// workspace — não precisa configurar de novo).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCHEMA_PLANO = {
  type: "object",
  properties: {
    nome_projeto: {
      type: "string",
      description:
        "Nome curto (até ~8 palavras) pro projeto, baseado no assunto geral do documento. Ex: 'Saneamento do Cadastro de Produtos'.",
    },
    descricao_projeto: {
      type: "string",
      description: "Uma frase resumindo o objetivo do projeto, baseada no documento.",
    },
    etapas: {
      type: "array",
      description:
        "O plano de ação extraído do documento, em ordem lógica/cronológica. Se o documento já tiver etapas/fases claramente " +
        "demarcadas (numeradas, em tópicos, em um cronograma), use-as como base. Se o documento for um texto corrido sem " +
        "etapas explícitas (ex: um relatório, uma ata, uma proposta), estruture você mesmo um plano de ação razoável a partir " +
        "do conteúdo — não deixe o array vazio.",
      items: {
        type: "object",
        properties: {
          titulo: {
            type: "string",
            description: "Título curto da etapa, começando com um verbo de ação quando possível (ex: 'Diagnóstico e priorização').",
          },
          descricao: {
            type: "string",
            description: "1-2 frases explicando o que precisa ser feito nesta etapa.",
          },
          prazo_sugerido: {
            type: "string",
            description:
              "Prazo sugerido pra etapa, como texto livre (ex: '2 semanas', '1 mês', 'Contínuo'), só se o documento indicar " +
              "algum prazo/cronograma pra ela. Omita o campo se o documento não sugerir prazo nenhum — não invente um.",
          },
        },
        required: ["titulo", "descricao"],
        additionalProperties: false,
      },
    },
  },
  required: ["etapas"],
  additionalProperties: false,
};

const PROMPT_PLANO =
  "Leia este documento (pode ser um plano de projeto, relatório, ata de reunião, proposta, e-mail formatado etc.) e extraia " +
  "dele um plano de ação estruturado em etapas sequenciais, pronto pra virar um checklist de acompanhamento.\n\n" +
  "Se o documento já apresenta etapas/fases claramente demarcadas (numeradas, em tópicos, num cronograma), use-as como base " +
  "pras etapas do plano, mantendo os títulos e descrições fiéis ao que está escrito. Se o documento for um texto corrido " +
  "sem etapas explícitas, estruture você mesmo um plano de ação razoável e acionável a partir do conteúdo — nunca devolva " +
  "o array de etapas vazio.\n\n" +
  "Para cada etapa: um título curto e claro, uma descrição de 1-2 frases do que precisa ser feito, e um prazo sugerido " +
  "somente se o documento indicar algum prazo ou cronograma pra ela (não invente prazos que não estão no texto).\n\n" +
  "Também sugira um nome curto pro projeto e uma descrição de uma frase, baseados no assunto geral do documento.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { file_base64, media_type } = await req.json();
    if (!file_base64 || typeof file_base64 !== "string") {
      return jsonResponse({ error: "Campo file_base64 ausente ou inválido." }, 400);
    }
    const mediaType = typeof media_type === "string" && media_type ? media_type : "application/pdf";

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "ANTHROPIC_API_KEY não configurada no servidor." }, 500);
    }

    const isImage = mediaType.startsWith("image/");
    const fileBlock = isImage
      ? { type: "image", source: { type: "base64", media_type: mediaType, data: file_base64 } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: file_base64 } };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        output_config: { format: { type: "json_schema", schema: SCHEMA_PLANO } },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT_PLANO },
              fileBlock,
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
      return jsonResponse({ error: "O modelo recusou processar este documento." }, 422);
    }

    const textBlock = (data.content || []).find((b: { type: string }) => b.type === "text");
    if (!textBlock) {
      return jsonResponse({ error: "Resposta inesperada do modelo (sem texto)." }, 502);
    }

    const extraido = JSON.parse(textBlock.text);
    return jsonResponse({ data: extraido, usage: data.usage }, 200);
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
