const SUPABASE_URL = "https://jvfyqvefznkpcvjaerta.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2ZnlxdmVmem5rcGN2amFlcnRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMTQ4NjgsImV4cCI6MjEwMTc5MDg2OH0.2Ef6LpZ61WM8myHBYeQGo3TuGqk5C3x36ER_sWRNPS4";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DOC_BUCKET = "pa_documentos";

// Chave publicável do mesmo projeto Supabase, usada só pra chamar o Edge
// Function de IA (mesma chave já usada nos outros apps deste workspace).
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4fZ0DlFJq1ec5xTXurwGSQ_Ke3JELGZ";
// Nome real no Supabase é "smooth-responder" (o campo de nome não pegou
// "extract-plano-acao" ao publicar — mesmo gotcha já visto em outros apps
// deste workspace, ex: "rapid-service"/"rapid-action"). Se a função for
// republicada/recriada com um nome que realmente pegue, atualize aqui.
const PLANO_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/smooth-responder`;
// Nome real da função "comparar-versoes" — a confirmar após o primeiro
// deploy (mesmo gotcha do nome do Function no dashboard, ver acima).
const COMPARE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/comparar-versoes`;

if(window.pdfjsLib){
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

function mostrarToast(msg, isError){
  let t = document.getElementById("toast");
  if(!t){
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = "toast show" + (isError ? " error" : "");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = "toast"; }, 4000);
}

function pareceErroDeRede(error){
  if(!error) return false;
  const m = (error.message || "").toLowerCase();
  return m.includes("fetch") || m.includes("network") || m.includes("timeout");
}

function tratarErro(error, contexto){
  console.error(contexto, error);
  if(pareceErroDeRede(error)){
    mostrarToast("Sem conexão. Verifique a internet e tente novamente.", true);
  } else {
    mostrarToast("Erro: " + (error.message || contexto), true);
  }
}

function escapeHtml(str){
  if(str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function formatarData(iso){
  if(!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"});
}

function formatarTamanho(bytes){
  if(!bytes) return "";
  if(bytes < 1024) return bytes + " B";
  if(bytes < 1024*1024) return (bytes/1024).toFixed(0) + " KB";
  return (bytes/(1024*1024)).toFixed(1) + " MB";
}

function getMeuNome(){
  return localStorage.getItem("pa_meu_nome") || "";
}
function setMeuNome(nome){
  localStorage.setItem("pa_meu_nome", nome);
}

function toggleForm(id){
  const el = document.getElementById(id);
  if(el) el.classList.toggle("hidden");
}

// ---------- STATUS ----------
const STATUS_LABEL = {
  nao_iniciado: "Não iniciado",
  andamento: "Em andamento",
  concluido: "Concluído"
};
const STATUS_ORDER = ["nao_iniciado", "andamento", "concluido"];

function statusInicial(){ return "nao_iniciado"; }

// ================= INDEX (lista de projetos) =================
async function initIndex(){
  const grid = document.getElementById("projectsGrid");
  const empty = document.getElementById("empty");
  grid.innerHTML = "<div class=\"empty\">Carregando...</div>";

  const { data: projetos, error } = await db.from("pa_projetos").select("*").order("criado_em", { ascending: false });
  if(error){ tratarErro(error, "carregar projetos"); grid.innerHTML = ""; return; }

  if(!projetos || projetos.length === 0){
    grid.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  const { data: etapas, error: errEtapas } = await db.from("pa_etapas").select("projeto_id, status");
  if(errEtapas){ tratarErro(errEtapas, "carregar etapas"); }

  const porProjeto = {};
  (etapas || []).forEach(e => {
    if(!porProjeto[e.projeto_id]) porProjeto[e.projeto_id] = [];
    porProjeto[e.projeto_id].push(e);
  });

  grid.innerHTML = projetos.map(p => {
    const lista = porProjeto[p.id] || [];
    const total = lista.length;
    const done = lista.filter(e => e.status === "concluido").length;
    const andamento = lista.filter(e => e.status === "andamento").length;
    const pctDone = total ? Math.round((done/total)*100) : 0;
    const pctAndamento = total ? Math.round((andamento/total)*100) : 0;
    return `
    <a class="project-card" href="projeto.html?id=${encodeURIComponent(p.id)}">
      <div class="project-card-top">
        <h3>${escapeHtml(p.nome)}</h3>
        <span class="pct">${pctDone}%</span>
      </div>
      ${p.descricao ? `<p>${escapeHtml(p.descricao)}</p>` : ""}
      <div class="bar-track">
        <div class="bar-done" style="width:${pctDone}%"></div>
        <div class="bar-progress" style="width:${pctAndamento}%"></div>
      </div>
      <div class="project-card-meta">
        <span>${total} etapa${total===1?"":"s"}</span>
        <span>${done} concluída${done===1?"":"s"}</span>
        <span>Criado em ${p.criado_em ? new Date(p.criado_em).toLocaleDateString("pt-BR") : ""}</span>
      </div>
    </a>`;
  }).join("");
}

async function criarProjeto(ev){
  ev.preventDefault();
  const nome = document.getElementById("novoNome").value.trim();
  const descricao = document.getElementById("novaDescricao").value.trim();
  if(!nome){ mostrarToast("Digite o nome do projeto.", true); return; }
  const { data, error } = await db.from("pa_projetos").insert({ nome, descricao: descricao || null }).select().single();
  if(error){ tratarErro(error, "criar projeto"); return; }
  window.location.href = "projeto.html?id=" + encodeURIComponent(data.id);
}

// ---------- Criar projeto anexando documento (IA sugere o plano) ----------
function arquivoParaBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
  });
}

function mostrarAbaNovoProjeto(modo){
  document.getElementById("tabEmBranco").classList.toggle("hidden", modo !== "branco");
  document.getElementById("tabComIA").classList.toggle("hidden", modo !== "ia");
  document.getElementById("btnAbaEmBranco").classList.toggle("active-nao", modo === "branco");
  document.getElementById("btnAbaComIA").classList.toggle("active-nao", modo === "ia");
}

let IA_ARQUIVO = null;
let IA_ETAPAS = [];

async function analisarComIA(ev){
  ev.preventDefault();
  const fileInput = document.getElementById("iaArquivo");
  const file = fileInput.files[0];
  if(!file){ mostrarToast("Escolha um arquivo.", true); return; }

  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isImage = file.type.startsWith("image/");
  if(!isPdf && !isImage){
    mostrarToast("Só é possível enviar PDF ou foto/imagem. Se for PowerPoint ou Word, exporte como PDF primeiro (Arquivo > Salvar como > PDF) e envie esse arquivo.", true);
    return;
  }

  const btn = document.getElementById("btnAnalisarIA");
  btn.disabled = true;
  btn.textContent = "Analisando com IA...";

  try{
    const base64 = await arquivoParaBase64(file);
    const resp = await fetch(PLANO_FUNCTION_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ file_base64: base64, media_type: file.type || "application/pdf" }),
    });
    const resultado = await resp.json();
    if(!resp.ok || resultado.error){ throw new Error(resultado.error || "Falha ao analisar o documento."); }

    IA_ARQUIVO = file;
    IA_ETAPAS = (resultado.data.etapas || []).map(e => ({ titulo: e.titulo || "", descricao: e.descricao || "", prazo_sugerido: e.prazo_sugerido || "" }));
    document.getElementById("iaNome").value = resultado.data.nome_projeto || file.name;
    document.getElementById("iaDescricao").value = resultado.data.descricao_projeto || "";
    renderIaEtapas();
    document.getElementById("iaRevisao").classList.remove("hidden");
    mostrarToast("Plano sugerido — revise antes de criar o projeto.");
  } catch(err){
    tratarErro(err, "analisar documento");
  } finally {
    btn.disabled = false;
    btn.textContent = "Analisar com IA";
  }
}

function renderIaEtapas(){
  const wrap = document.getElementById("iaEtapasList");
  if(IA_ETAPAS.length === 0){
    wrap.innerHTML = `<div class="empty">Nenhuma etapa sugerida. Adicione manualmente abaixo.</div>`;
    return;
  }
  wrap.innerHTML = IA_ETAPAS.map((e, idx) => `
    <div class="inline-form" style="margin-top:${idx === 0 ? 0 : 10}px;">
      <div class="row">
        <div style="flex:2;">
          <label>Título</label>
          <input type="text" value="${escapeHtml(e.titulo)}" oninput="IA_ETAPAS[${idx}].titulo=this.value">
        </div>
        <div>
          <label>Prazo sugerido</label>
          <input type="text" value="${escapeHtml(e.prazo_sugerido)}" oninput="IA_ETAPAS[${idx}].prazo_sugerido=this.value">
        </div>
      </div>
      <div>
        <label>Descrição</label>
        <textarea oninput="IA_ETAPAS[${idx}].descricao=this.value">${escapeHtml(e.descricao)}</textarea>
      </div>
      <div class="actions">
        <button type="button" class="icon-btn danger" onclick="removerIaEtapa(${idx})">Remover etapa</button>
      </div>
    </div>
  `).join("");
}

function removerIaEtapa(idx){
  IA_ETAPAS.splice(idx, 1);
  renderIaEtapas();
}

function adicionarIaEtapaVazia(){
  IA_ETAPAS.push({ titulo: "", descricao: "", prazo_sugerido: "" });
  renderIaEtapas();
}

async function criarProjetoComIA(ev){
  ev.preventDefault();
  const nome = document.getElementById("iaNome").value.trim();
  const descricao = document.getElementById("iaDescricao").value.trim();
  if(!nome){ mostrarToast("Digite o nome do projeto.", true); return; }
  const etapasValidas = IA_ETAPAS.filter(e => e.titulo.trim());
  if(etapasValidas.length === 0){ mostrarToast("Adicione ao menos uma etapa.", true); return; }

  const btn = document.getElementById("btnCriarComIA");
  btn.disabled = true;
  btn.textContent = "Criando...";

  const { data: projeto, error } = await db.from("pa_projetos").insert({ nome, descricao: descricao || null }).select().single();
  if(error){ tratarErro(error, "criar projeto"); btn.disabled = false; btn.textContent = "Criar projeto"; return; }

  const { error: errEtapas } = await db.from("pa_etapas").insert(etapasValidas.map((e, idx) => ({
    projeto_id: projeto.id,
    ordem: idx + 1,
    titulo: e.titulo.trim(),
    descricao: e.descricao.trim() || null,
    prazo_sugerido: e.prazo_sugerido.trim() || null,
    status: statusInicial(),
  })));
  if(errEtapas){ tratarErro(errEtapas, "salvar etapas"); }

  if(IA_ARQUIVO){
    const caminho = projeto.id + "/v1_" + Date.now() + "_" + IA_ARQUIVO.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { error: errUpload } = await db.storage.from(DOC_BUCKET).upload(caminho, IA_ARQUIVO, { contentType: IA_ARQUIVO.type || "application/octet-stream" });
    if(!errUpload){
      const { data: pub } = db.storage.from(DOC_BUCKET).getPublicUrl(caminho);
      await db.from("pa_documentos").insert({
        projeto_id: projeto.id,
        nome_arquivo: IA_ARQUIVO.name,
        versao: 1,
        arquivo_url: pub.publicUrl,
        tamanho_bytes: IA_ARQUIVO.size,
        enviado_por: "Documento original (anexado na criação)",
      });
    }

    btn.textContent = "Gerando slides...";
    try{ await substituirSlidesPeloArquivo(projeto.id, IA_ARQUIVO); }
    catch(err){ console.error("gerar slides do documento", err); }
  }

  window.location.href = "projeto.html?id=" + encodeURIComponent(projeto.id);
}

// Converte o documento anexado em imagens de slide: cada página do PDF vira
// um slide (via pdf.js, renderizado no navegador); se for uma foto/imagem
// única, ela mesma vira o único slide.
async function gerarSlidesDoArquivo(file){
  if(file.type.startsWith("image/")){
    return [file];
  }
  if(file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)){
    return [];
  }
  if(!window.pdfjsLib){
    return [];
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const blobs = [];
  for(let i = 1; i <= pdf.numPages; i++){
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if(blob) blobs.push(blob);
  }
  return blobs;
}

// ================= PROJETO (detalhe) =================
function getProjetoId(){
  return new URLSearchParams(window.location.search).get("id");
}

let ETAPAS_CACHE = [];

async function initProjeto(){
  const id = getProjetoId();
  if(!id){ document.getElementById("projTitle").textContent = "Projeto não encontrado"; return; }

  const { data: projeto, error } = await db.from("pa_projetos").select("*").eq("id", id).single();
  if(error || !projeto){ tratarErro(error || {message:"não encontrado"}, "carregar projeto"); return; }

  document.getElementById("projTitle").textContent = projeto.nome;
  document.getElementById("projDesc").textContent = projeto.descricao || "";
  document.getElementById("editNome").value = projeto.nome;
  document.getElementById("editDescricao").value = projeto.descricao || "";

  await carregarEtapas(id);
  await carregarDocumentos(id);
  await carregarSlides(id);
}

function mostrarAbaProjeto(nome){
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === nome));
  document.getElementById("tab-plano").classList.toggle("active", nome === "plano");
  document.getElementById("tab-apresentacao").classList.toggle("active", nome === "apresentacao");
}

async function carregarEtapas(projetoId){
  const { data, error } = await db.from("pa_etapas").select("*").eq("projeto_id", projetoId).order("ordem", { ascending: true });
  if(error){ tratarErro(error, "carregar etapas"); return; }
  ETAPAS_CACHE = data || [];
  renderEtapas();
  renderStats();
}

function renderStats(){
  const total = ETAPAS_CACHE.length;
  const done = ETAPAS_CACHE.filter(e => e.status === "concluido").length;
  const andamento = ETAPAS_CACHE.filter(e => e.status === "andamento").length;
  const pctDone = total ? Math.round((done/total)*100) : 0;
  const pctAndamento = total ? Math.round((andamento/total)*100) : 0;

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statDone").textContent = done;
  document.getElementById("statAndamento").textContent = andamento;
  document.getElementById("statPct").textContent = pctDone + "%";
  document.getElementById("barDone").style.width = pctDone + "%";
  document.getElementById("barProgress").style.width = pctAndamento + "%";
}

function renderEtapas(){
  const wrap = document.getElementById("stepper");
  if(ETAPAS_CACHE.length === 0){
    wrap.innerHTML = `<div class="empty">Nenhuma etapa ainda. Adicione a primeira etapa do plano de ação.</div>`;
    return;
  }
  wrap.innerHTML = ETAPAS_CACHE.map((e, idx) => {
    const num = e.status === "concluido" ? "✓" : (idx + 1);
    const markerClass = e.status === "concluido" ? "concluido" : (e.status === "andamento" ? "andamento" : "");
    const connectorFilled = e.status === "concluido";
    return `
    <div class="stage">
      <div class="marker-col">
        <div class="marker ${markerClass}">${num}</div>
        ${idx < ETAPAS_CACHE.length - 1 ? `<div class="connector ${connectorFilled ? "filled" : ""}"></div>` : ""}
      </div>
      <div class="stage-body">
        <div class="stage-top">
          <p class="stage-title">${escapeHtml(e.titulo)}</p>
        </div>
        ${e.descricao ? `<p class="stage-desc">${escapeHtml(e.descricao)}</p>` : ""}

        <span class="meta-label">Responsáveis</span>
        <div class="resp-list">
          ${(e.responsaveis || []).map((r, ridx) => `
            <span class="resp-chip">
              <input type="text" value="${escapeHtml(r)}" placeholder="Nome"
                onchange="atualizarResponsavel('${e.id}',${ridx},this.value)">
              <button type="button" class="resp-remove" onclick="removerResponsavel('${e.id}',${ridx})">&times;</button>
            </span>
          `).join("")}
          <button type="button" class="btn btn-outline btn-sm" onclick="adicionarResponsavel('${e.id}')">+ Adicionar responsável</button>
        </div>

        <div class="stage-meta">
          <span>Prazo:
            <input type="date" value="${e.prazo || ""}"
              onchange="atualizarEtapaCampo('${e.id}','prazo',this.value)">
          </span>
          ${e.prazo_sugerido ? `<span>Sugerido: ${escapeHtml(e.prazo_sugerido)}</span>` : ""}
        </div>

        <span class="meta-label">Observações</span>
        <textarea class="obs-field" placeholder="Anotações sobre esta etapa..."
          onchange="atualizarEtapaCampo('${e.id}','observacoes',this.value)">${escapeHtml(e.observacoes || "")}</textarea>

        <div class="segctl">
          ${STATUS_ORDER.map(s => `
            <button class="${e.status === s ? "active-" + s.replace("nao_iniciado","nao") : ""}"
              onclick="atualizarEtapaStatus('${e.id}','${s}')">${STATUS_LABEL[s]}</button>
          `).join("")}
        </div>
        <div class="stage-actions">
          <button class="icon-btn" title="Mover para cima" ${idx === 0 ? "disabled" : ""} onclick="moverEtapa('${e.id}',-1)">&uarr; Mover</button>
          <button class="icon-btn" title="Mover para baixo" ${idx === ETAPAS_CACHE.length - 1 ? "disabled" : ""} onclick="moverEtapa('${e.id}',1)">&darr; Mover</button>
          <button class="icon-btn danger" onclick="excluirEtapa('${e.id}')">Excluir etapa</button>
        </div>
      </div>
    </div>`;
  }).join("");
}

async function atualizarEtapaStatus(etapaId, status){
  const { error } = await db.from("pa_etapas").update({ status, atualizado_em: new Date().toISOString() }).eq("id", etapaId);
  if(error){ tratarErro(error, "atualizar status"); return; }
  const e = ETAPAS_CACHE.find(x => x.id === etapaId);
  if(e) e.status = status;
  renderEtapas();
  renderStats();
}

async function atualizarEtapaCampo(etapaId, campo, valor){
  const payload = {};
  payload[campo] = valor || null;
  const { error } = await db.from("pa_etapas").update(payload).eq("id", etapaId);
  if(error){ tratarErro(error, "atualizar etapa"); return; }
  const e = ETAPAS_CACHE.find(x => x.id === etapaId);
  if(e) e[campo] = valor;
  mostrarToast("Salvo.");
}

async function salvarOrdemEtapas(idsOrdenados){
  await Promise.all(idsOrdenados.map((id, idx) =>
    db.from("pa_etapas").update({ ordem: idx + 1 }).eq("id", id)
  ));
}

async function moverEtapa(etapaId, direcao){
  const idx = ETAPAS_CACHE.findIndex(e => e.id === etapaId);
  const novoIdx = idx + direcao;
  if(idx === -1 || novoIdx < 0 || novoIdx >= ETAPAS_CACHE.length) return;
  const ids = ETAPAS_CACHE.map(e => e.id);
  [ids[idx], ids[novoIdx]] = [ids[novoIdx], ids[idx]];
  await salvarOrdemEtapas(ids);
  await carregarEtapas(getProjetoId());
}

async function salvarResponsaveis(e){
  const limpo = (e.responsaveis || []).filter(r => r && r.trim());
  const { error } = await db.from("pa_etapas").update({ responsaveis: limpo }).eq("id", e.id);
  if(error){ tratarErro(error, "salvar responsáveis"); return; }
  e.responsaveis = limpo;
  renderEtapas();
  mostrarToast("Salvo.");
}

function atualizarResponsavel(etapaId, idx, valor){
  const e = ETAPAS_CACHE.find(x => x.id === etapaId);
  if(!e) return;
  e.responsaveis[idx] = valor;
  salvarResponsaveis(e);
}

function adicionarResponsavel(etapaId){
  const e = ETAPAS_CACHE.find(x => x.id === etapaId);
  if(!e) return;
  if(!e.responsaveis) e.responsaveis = [];
  e.responsaveis.push("");
  renderEtapas();
}

function removerResponsavel(etapaId, idx){
  const e = ETAPAS_CACHE.find(x => x.id === etapaId);
  if(!e) return;
  e.responsaveis.splice(idx, 1);
  salvarResponsaveis(e);
}

async function excluirEtapa(etapaId){
  if(!confirmarDuploClique(event.target)) return;
  const { error } = await db.from("pa_etapas").delete().eq("id", etapaId);
  if(error){ tratarErro(error, "excluir etapa"); return; }
  await carregarEtapas(getProjetoId());
  mostrarToast("Etapa excluída.");
}

function abrirFormNovaEtapa(){
  const sel = document.getElementById("etapaPosicao");
  let html = `<option value="0">No início${ETAPAS_CACHE.length ? " (antes da etapa 1)" : ""}</option>`;
  ETAPAS_CACHE.forEach((e, idx) => {
    html += `<option value="${idx + 1}">Depois da etapa ${idx + 1} — ${escapeHtml(e.titulo)}</option>`;
  });
  sel.innerHTML = html;
  sel.value = String(ETAPAS_CACHE.length); // padrão: no final
  document.getElementById("formNovaEtapa").classList.remove("hidden");
}

async function adicionarEtapa(ev){
  ev.preventDefault();
  const titulo = document.getElementById("etapaTitulo").value.trim();
  const descricao = document.getElementById("etapaDescricao").value.trim();
  const prazoSugerido = document.getElementById("etapaPrazoSugerido").value.trim();
  const posicao = parseInt(document.getElementById("etapaPosicao").value, 10) || 0;
  if(!titulo){ mostrarToast("Digite o título da etapa.", true); return; }

  const { data: novaEtapa, error } = await db.from("pa_etapas").insert({
    projeto_id: getProjetoId(),
    titulo, descricao: descricao || null,
    prazo_sugerido: prazoSugerido || null,
    ordem: posicao + 1, status: statusInicial()
  }).select().single();
  if(error){ tratarErro(error, "adicionar etapa"); return; }

  const idsOrdenados = ETAPAS_CACHE.map(e => e.id);
  idsOrdenados.splice(posicao, 0, novaEtapa.id);
  await salvarOrdemEtapas(idsOrdenados);

  document.getElementById("etapaTitulo").value = "";
  document.getElementById("etapaDescricao").value = "";
  document.getElementById("etapaPrazoSugerido").value = "";
  document.getElementById("formNovaEtapa").classList.add("hidden");
  await carregarEtapas(getProjetoId());
  mostrarToast("Etapa adicionada.");
}

async function salvarProjeto(ev){
  ev.preventDefault();
  const nome = document.getElementById("editNome").value.trim();
  const descricao = document.getElementById("editDescricao").value.trim();
  if(!nome){ mostrarToast("Digite o nome do projeto.", true); return; }
  const { error } = await db.from("pa_projetos").update({ nome, descricao: descricao || null }).eq("id", getProjetoId());
  if(error){ tratarErro(error, "salvar projeto"); return; }
  document.getElementById("projTitle").textContent = nome;
  document.getElementById("projDesc").textContent = descricao;
  document.getElementById("formEditarProjeto").classList.add("hidden");
  mostrarToast("Projeto atualizado.");
}

function confirmarDuploClique(btn){
  if(!btn) return true;
  if(btn.dataset.confirm === "1"){
    delete btn.dataset.confirm;
    return true;
  }
  btn.dataset.confirm = "1";
  const original = btn.textContent;
  btn.textContent = "Confirmar exclusão?";
  setTimeout(() => { btn.textContent = original; delete btn.dataset.confirm; }, 3000);
  return false;
}

async function excluirProjeto(){
  if(!confirmarDuploClique(event.target)) return;
  const { error } = await db.from("pa_projetos").delete().eq("id", getProjetoId());
  if(error){ tratarErro(error, "excluir projeto"); return; }
  window.location.href = "index.html";
}

// ---------- Documentos (versões) ----------
async function carregarDocumentos(projetoId){
  const { data, error } = await db.from("pa_documentos").select("*").eq("projeto_id", projetoId).order("versao", { ascending: false });
  if(error){ tratarErro(error, "carregar documentos"); return; }
  const wrap = document.getElementById("docList");
  if(!data || data.length === 0){
    wrap.innerHTML = `<div class="empty">Nenhum documento enviado ainda.</div>`;
    return;
  }
  wrap.innerHTML = data.map(d => `
    <div class="doc-item" data-doc-id="${d.id}">
      <div class="doc-row">
        <div class="doc-info">
          <span class="doc-version">v${d.versao}</span>
          <div class="doc-text">
            <div class="doc-name">${escapeHtml(d.nome_arquivo)}</div>
            <div class="doc-meta">${escapeHtml(d.enviado_por || "—")} · ${formatarData(d.enviado_em)} ${d.tamanho_bytes ? "· " + formatarTamanho(d.tamanho_bytes) : ""}</div>
          </div>
        </div>
        <a class="btn btn-outline btn-sm" href="${d.arquivo_url}" target="_blank" rel="noopener">Baixar</a>
      </div>
      ${d.resumo_mudancas ? `<p class="doc-resumo">🤖 ${escapeHtml(d.resumo_mudancas)}</p>` : ""}
    </div>
  `).join("");
}

async function enviarDocumento(ev){
  ev.preventDefault();
  const fileInput = document.getElementById("docArquivo");
  const nome = document.getElementById("docEnviadoPor").value.trim();
  const file = fileInput.files[0];
  if(!file){ mostrarToast("Escolha um arquivo.", true); return; }
  if(!nome){ mostrarToast("Digite seu nome.", true); return; }
  setMeuNome(nome);

  const btn = document.getElementById("btnEnviarDoc");
  btn.disabled = true;
  btn.textContent = "Enviando...";

  const projetoId = getProjetoId();
  const { data: existentes, error: errCount } = await db.from("pa_documentos").select("*").eq("projeto_id", projetoId).order("versao", { ascending: false }).limit(1);
  if(errCount){ tratarErro(errCount, "verificar versão"); btn.disabled = false; btn.textContent = "Enviar"; return; }
  const versaoAnterior = (existentes && existentes.length) ? existentes[0] : null;
  const versao = versaoAnterior ? versaoAnterior.versao + 1 : 1;

  const caminho = projetoId + "/v" + versao + "_" + Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const { error: errUpload } = await db.storage.from(DOC_BUCKET).upload(caminho, file, { contentType: file.type || "application/octet-stream" });
  if(errUpload){ tratarErro(errUpload, "enviar arquivo"); btn.disabled = false; btn.textContent = "Enviar"; return; }

  const { data: pub } = db.storage.from(DOC_BUCKET).getPublicUrl(caminho);
  const { data: novoDoc, error: errInsert } = await db.from("pa_documentos").insert({
    projeto_id: projetoId,
    nome_arquivo: file.name,
    versao,
    arquivo_url: pub.publicUrl,
    tamanho_bytes: file.size,
    enviado_por: nome
  }).select().single();
  if(errInsert){ tratarErro(errInsert, "registrar documento"); btn.disabled = false; btn.textContent = "Enviar"; return; }

  const ehApresentavel = file.type.startsWith("image/") || file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if(ehApresentavel){
    btn.textContent = "Atualizando apresentação...";
    try{ await substituirSlidesPeloArquivo(projetoId, file); }
    catch(err){ console.error("regenerar slides", err); }
  }

  if(ehApresentavel && versaoAnterior){
    const anteriorEhApresentavel = /\.pdf$/i.test(versaoAnterior.nome_arquivo) || /\.(jpe?g|png|gif|webp)$/i.test(versaoAnterior.nome_arquivo);
    if(anteriorEhApresentavel){
      btn.textContent = "Comparando com versão anterior...";
      try{ await gerarResumoMudancas(novoDoc.id, versaoAnterior, file); }
      catch(err){ console.error("comparar versões", err); }
    }
  }

  fileInput.value = "";
  document.getElementById("formNovoDoc").classList.add("hidden");
  btn.disabled = false;
  btn.textContent = "Enviar";
  await carregarDocumentos(projetoId);
  mostrarToast("Documento enviado como v" + versao + (ehApresentavel ? " — apresentação atualizada." : "."));
}

// Compara a nova versão com a anterior via IA e grava um resumo do que
// mudou, direto na linha do documento recém-criado.
async function gerarResumoMudancas(novoDocId, docAnterior, arquivoNovo){
  const respAnterior = await fetch(docAnterior.arquivo_url);
  const blobAnterior = await respAnterior.blob();
  const base64Anterior = await arquivoParaBase64(blobAnterior);
  const base64Novo = await arquivoParaBase64(arquivoNovo);

  const mediaTypeAnterior = /\.pdf$/i.test(docAnterior.nome_arquivo) ? "application/pdf" : (blobAnterior.type || "image/jpeg");
  const mediaTypeNovo = arquivoNovo.type || (/\.pdf$/i.test(arquivoNovo.name) ? "application/pdf" : "image/jpeg");

  const resp = await fetch(COMPARE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({
      arquivo_anterior_base64: base64Anterior, media_type_anterior: mediaTypeAnterior,
      arquivo_novo_base64: base64Novo, media_type_novo: mediaTypeNovo,
    }),
  });
  const resultado = await resp.json();
  if(!resp.ok || resultado.error){ throw new Error(resultado.error || "Falha ao comparar versões."); }

  await db.from("pa_documentos").update({ resumo_mudancas: resultado.data.resumo }).eq("id", novoDocId);
}

// Toda vez que uma nova versão de um documento apresentável (PDF/imagem) é
// enviada, a aba Apresentação passa a refletir SEMPRE essa versão mais
// recente — os slides antigos são descartados e substituídos pelos da nova
// versão, em vez de acumular apresentações desatualizadas.
async function substituirSlidesPeloArquivo(projetoId, file){
  await db.from("pa_slides").delete().eq("projeto_id", projetoId);
  const slides = await gerarSlidesDoArquivo(file);
  let ordem = 1;
  for(const blob of slides){
    const caminho = projetoId + "/" + ordem + "_" + Date.now() + ".jpg";
    const { error: errUp } = await db.storage.from(SLIDES_BUCKET).upload(caminho, blob, { contentType: "image/jpeg" });
    if(errUp) continue;
    const { data: pub } = db.storage.from(SLIDES_BUCKET).getPublicUrl(caminho);
    await db.from("pa_slides").insert({ projeto_id: projetoId, ordem, imagem_url: pub.publicUrl });
    ordem++;
  }
  await carregarSlides(projetoId);
}

// ---------- Apresentação (slides) ----------
const SLIDES_BUCKET = "pa_slides";
let SLIDES_CACHE = [];
let SLIDE_IDX = 0;

async function carregarSlides(projetoId){
  const { data, error } = await db.from("pa_slides").select("*").eq("projeto_id", projetoId).order("ordem", { ascending: true });
  if(error){ tratarErro(error, "carregar slides"); return; }
  SLIDES_CACHE = data || [];
  SLIDE_IDX = 0;
  renderSlideViewer();
}

function renderSlideViewer(){
  const empty = document.getElementById("slideEmpty");
  const viewer = document.getElementById("slideViewer");
  const delRow = document.getElementById("slideDeleteRow");
  if(!empty || !viewer || !delRow) return; // não está na página do projeto (ex: chamado durante a criação, em index.html)
  if(SLIDES_CACHE.length === 0){
    empty.classList.remove("hidden");
    viewer.classList.add("hidden");
    delRow.innerHTML = "";
    return;
  }
  empty.classList.add("hidden");
  viewer.classList.remove("hidden");

  document.getElementById("slideImg").src = SLIDES_CACHE[SLIDE_IDX].imagem_url;
  document.getElementById("slideCounter").textContent = (SLIDE_IDX + 1) + " / " + SLIDES_CACHE.length;
  document.getElementById("btnPrevSlide").disabled = SLIDE_IDX === 0;
  document.getElementById("btnNextSlide").disabled = SLIDE_IDX === SLIDES_CACHE.length - 1;
  delRow.innerHTML = `<button class="icon-btn danger" onclick="excluirSlideAtual()">Excluir este slide</button>`;
}

function mudarSlide(delta){
  const novo = SLIDE_IDX + delta;
  if(novo < 0 || novo >= SLIDES_CACHE.length) return;
  SLIDE_IDX = novo;
  renderSlideViewer();
}

async function enviarSlides(ev){
  const files = Array.from(ev.target.files || []);
  if(files.length === 0) return;

  const projetoId = getProjetoId();
  let ordem = SLIDES_CACHE.length ? Math.max(...SLIDES_CACHE.map(s => s.ordem)) + 1 : 1;

  for(const file of files){
    const caminho = projetoId + "/" + ordem + "_" + Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { error: errUpload } = await db.storage.from(SLIDES_BUCKET).upload(caminho, file, { contentType: file.type || "image/jpeg" });
    if(errUpload){ tratarErro(errUpload, "enviar slide"); continue; }
    const { data: pub } = db.storage.from(SLIDES_BUCKET).getPublicUrl(caminho);
    const { error: errInsert } = await db.from("pa_slides").insert({ projeto_id: projetoId, ordem, imagem_url: pub.publicUrl });
    if(errInsert){ tratarErro(errInsert, "registrar slide"); continue; }
    ordem++;
  }

  ev.target.value = "";
  await carregarSlides(projetoId);
  mostrarToast("Slides enviados.");
}

async function excluirSlideAtual(){
  if(!confirmarDuploClique(event.target)) return;
  const slide = SLIDES_CACHE[SLIDE_IDX];
  if(!slide) return;
  const { error } = await db.from("pa_slides").delete().eq("id", slide.id);
  if(error){ tratarErro(error, "excluir slide"); return; }
  await carregarSlides(getProjetoId());
  mostrarToast("Slide excluído.");
}
