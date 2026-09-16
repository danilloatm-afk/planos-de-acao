const SUPABASE_URL = "https://jvfyqvefznkpcvjaerta.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2ZnlxdmVmem5rcGN2amFlcnRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMTQ4NjgsImV4cCI6MjEwMTc5MDg2OH0.2Ef6LpZ61WM8myHBYeQGo3TuGqk5C3x36ER_sWRNPS4";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DOC_BUCKET = "pa_documentos";

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
        <div class="stage-meta">
          <span>Responsável:
            <input type="text" value="${escapeHtml(e.responsavel || "")}" placeholder="—"
              onchange="atualizarEtapaCampo('${e.id}','responsavel',this.value)">
          </span>
          <span>Prazo:
            <input type="date" value="${e.prazo || ""}"
              onchange="atualizarEtapaCampo('${e.id}','prazo',this.value)">
          </span>
          ${e.prazo_sugerido ? `<span>Sugerido: ${escapeHtml(e.prazo_sugerido)}</span>` : ""}
        </div>
        <div class="segctl">
          ${STATUS_ORDER.map(s => `
            <button class="${e.status === s ? "active-" + s.replace("nao_iniciado","nao") : ""}"
              onclick="atualizarEtapaStatus('${e.id}','${s}')">${STATUS_LABEL[s]}</button>
          `).join("")}
        </div>
        <div class="stage-actions">
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

async function excluirEtapa(etapaId){
  if(!confirmarDuploClique(event.target)) return;
  const { error } = await db.from("pa_etapas").delete().eq("id", etapaId);
  if(error){ tratarErro(error, "excluir etapa"); return; }
  await carregarEtapas(getProjetoId());
  mostrarToast("Etapa excluída.");
}

async function adicionarEtapa(ev){
  ev.preventDefault();
  const titulo = document.getElementById("etapaTitulo").value.trim();
  const descricao = document.getElementById("etapaDescricao").value.trim();
  const prazoSugerido = document.getElementById("etapaPrazoSugerido").value.trim();
  if(!titulo){ mostrarToast("Digite o título da etapa.", true); return; }

  const ordem = ETAPAS_CACHE.length ? Math.max(...ETAPAS_CACHE.map(e => e.ordem)) + 1 : 1;
  const { error } = await db.from("pa_etapas").insert({
    projeto_id: getProjetoId(),
    titulo, descricao: descricao || null,
    prazo_sugerido: prazoSugerido || null,
    ordem, status: statusInicial()
  });
  if(error){ tratarErro(error, "adicionar etapa"); return; }

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
  const { data: existentes, error: errCount } = await db.from("pa_documentos").select("versao").eq("projeto_id", projetoId).order("versao", { ascending: false }).limit(1);
  if(errCount){ tratarErro(errCount, "verificar versão"); btn.disabled = false; btn.textContent = "Enviar"; return; }
  const versao = (existentes && existentes.length) ? existentes[0].versao + 1 : 1;

  const caminho = projetoId + "/v" + versao + "_" + Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const { error: errUpload } = await db.storage.from(DOC_BUCKET).upload(caminho, file, { contentType: file.type || "application/octet-stream" });
  if(errUpload){ tratarErro(errUpload, "enviar arquivo"); btn.disabled = false; btn.textContent = "Enviar"; return; }

  const { data: pub } = db.storage.from(DOC_BUCKET).getPublicUrl(caminho);
  const { error: errInsert } = await db.from("pa_documentos").insert({
    projeto_id: projetoId,
    nome_arquivo: file.name,
    versao,
    arquivo_url: pub.publicUrl,
    tamanho_bytes: file.size,
    enviado_por: nome
  });
  if(errInsert){ tratarErro(errInsert, "registrar documento"); btn.disabled = false; btn.textContent = "Enviar"; return; }

  fileInput.value = "";
  document.getElementById("formNovoDoc").classList.add("hidden");
  btn.disabled = false;
  btn.textContent = "Enviar";
  await carregarDocumentos(projetoId);
  mostrarToast("Documento enviado como v" + versao + ".");
}
