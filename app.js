(() => {
  const $ = id => document.getElementById(id);
  const video = $("cameraVideo"), canvas = $("previewCanvas"), ctx = canvas.getContext("2d", {willReadFrequently:true});
  let stream = null, imageReady = false, sourceType = "", sourceImage = null, roi = null, dragging = false, dragStart = null, cameraFrameLoop = 0;
  let toastTimer;
  const showToast = msg => { const t=$("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove("show"),2600); };

  function setCanvasSize(w,h){ const max=1400, scale=Math.min(1,max/Math.max(w,h)); canvas.width=Math.round(w*scale); canvas.height=Math.round(h*scale); }
  function drawImage(img){
    setCanvasSize(img.naturalWidth||img.videoWidth||img.width, img.naturalHeight||img.videoHeight||img.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height); imageReady=true; canvas.classList.add("visible");
    $("emptyState").style.display="none"; $("analyzeBtn").disabled=false; updateRoiLabel();
    drawOverlay();
  }
  function updateRoiLabel(){ $("roiLabel").textContent=roi?"ÁREA PERSONALIZADA":"ÁREA PADRÃO"; }
  function defaultRoi(){ return {x:canvas.width*.08,y:canvas.height*.08,w:canvas.width*.84,h:canvas.height*.84}; }
  function drawOverlay(){
    if(!imageReady)return;
    const r=roi||defaultRoi();
    ctx.save(); ctx.fillStyle="rgba(3,8,16,.42)";
    ctx.fillRect(0,0,canvas.width,r.y);ctx.fillRect(0,r.y+r.h,canvas.width,canvas.height-r.y-r.h);
    ctx.fillRect(0,r.y,r.x,r.h);ctx.fillRect(r.x+r.w,r.y,canvas.width-r.x-r.w,r.h);
    ctx.strokeStyle="#41e0aa";ctx.lineWidth=Math.max(2,canvas.width/500);ctx.setLineDash([8,5]);ctx.strokeRect(r.x,r.y,r.w,r.h);ctx.restore();
  }
  function redrawSource(){
    if(sourceType==="image" && sourceImage) drawImage(sourceImage);
    else if(sourceType==="camera" && video.readyState>=2) drawImage(video);
  }
  function liveCameraFrame(){
    if(sourceType!=="camera" || !stream || video.readyState<2) return;
    ctx.drawImage(video,0,0,canvas.width,canvas.height); drawOverlay();
    cameraFrameLoop=requestAnimationFrame(liveCameraFrame);
  }

  $("startCamera").addEventListener("click", async()=>{
    try{
      if(!navigator.mediaDevices?.getUserMedia) throw new Error("Câmera indisponível. Abra o app em HTTPS ou localhost.");
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});
      video.srcObject=stream; await video.play(); sourceType="camera"; sourceImage=null; roi=null;
      video.onloadedmetadata=()=>{drawImage(video);};
      drawImage(video); cancelAnimationFrame(cameraFrameLoop); liveCameraFrame(); $("sourceLabel").textContent="CÂMERA ATIVA"; $("startCamera").disabled=true; $("stopCamera").disabled=false;
      showToast("Câmera ativada. Enquadre o gráfico e selecione a região.");
    }catch(e){showToast(e.message||"Não foi possível acessar a câmera.");}
  });
  $("stopCamera").addEventListener("click",()=>{
    if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
    cancelAnimationFrame(cameraFrameLoop); video.srcObject=null; $("startCamera").disabled=false;$("stopCamera").disabled=true;
    if(sourceType==="camera"){sourceType="";imageReady=false;canvas.classList.remove("visible");$("emptyState").style.display="flex";$("analyzeBtn").disabled=true;$("sourceLabel").textContent="AGUARDANDO CAPTURA";}
  });
  $("imageInput").addEventListener("change",e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(!file.type.startsWith("image/")){showToast("Selecione um arquivo de imagem.");return;}
    const url=URL.createObjectURL(file), img=new Image();
    img.onload=()=>{if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;cancelAnimationFrame(cameraFrameLoop);video.srcObject=null;$("startCamera").disabled=false;$("stopCamera").disabled=true;}
      sourceType="image";sourceImage=img;roi=null;drawImage(img);$("sourceLabel").textContent="IMAGEM CARREGADA";showToast("Imagem pronta. Delimite a área do gráfico.");URL.revokeObjectURL(url);};
    img.onerror=()=>showToast("Não foi possível abrir essa imagem.");img.src=url;
  });

  function pointerPos(e){const rect=canvas.getBoundingClientRect();return {x:(e.clientX-rect.left)*canvas.width/rect.width,y:(e.clientY-rect.top)*canvas.height/rect.height};}
  canvas.addEventListener("pointerdown",e=>{if(!imageReady)return;dragging=true;dragStart=pointerPos(e);roi={x:dragStart.x,y:dragStart.y,w:0,h:0};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener("pointermove",e=>{if(!dragging)return;const p=pointerPos(e);roi={x:Math.min(p.x,dragStart.x),y:Math.min(p.y,dragStart.y),w:Math.abs(p.x-dragStart.x),h:Math.abs(p.y-dragStart.y)};redrawBaseAndOverlay();});
  canvas.addEventListener("pointerup",()=>{if(!dragging)return;dragging=false;if(roi.w<20||roi.h<20)roi=null;updateRoiLabel();redrawBaseAndOverlay();});
  function redrawBaseAndOverlay(){
    if(sourceType==="image"&&sourceImage)ctx.drawImage(sourceImage,0,0,canvas.width,canvas.height);
    else if(sourceType==="camera"&&video.readyState>=2)ctx.drawImage(video,0,0,canvas.width,canvas.height);
    drawOverlay();
  }
  $("resetArea").addEventListener("click",()=>{roi=null;redrawBaseAndOverlay();updateRoiLabel();showToast("Área padrão restaurada.");});

  function rgbToHsv(r,g,b){
    r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0,s=max===0?0:d/max,v=max;
    if(d!==0){switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h*=60;}
    return [h,s,v];
  }
  function analyze(){
    if(!imageReady)return null;
    redrawBaseAndOverlay();
    const r=roi||defaultRoi(), x=Math.max(0,Math.floor(r.x)), y=Math.max(0,Math.floor(r.y));
    const w=Math.max(1,Math.min(canvas.width-x,Math.floor(r.w))), h=Math.max(1,Math.min(canvas.height-y,Math.floor(r.h)));
    const data=ctx.getImageData(x,y,w,h).data, bins=Array.from({length:8},()=>({g:0,red:0,total:0}));
    let green=0,red=0,other=0;
    const step=Math.max(1,Math.floor(Math.sqrt((w*h)/160000)));
    for(let py=0;py<h;py+=step)for(let px=0;px<w;px+=step){
      const i=(py*w+px)*4, R=data[i],G=data[i+1],B=data[i+2], [hh,s,v]=rgbToHsv(R,G,B);
      if(s<.32||v<.22)continue;
      const bin=Math.min(7,Math.floor(px/w*8));
      if(hh>=75&&hh<=165&&G>R*1.12&&G>B*1.04){green++;bins[bin].g++;bins[bin].total++;}
      else if((hh<18||hh>340)&&R>G*1.18&&R>B*1.08){red++;bins[bin].red++;bins[bin].total++;}
      else other++;
    }
    const total=green+red, greenPct=total?green/total*100:0,redPct=total?red/total*100:0;
    const first=bins.slice(0,4).reduce((a,b)=>a+b.g-a.red,0),last=bins.slice(4).reduce((a,b)=>a+b.g-a.red,0);
    const delta=last-first, dominance=total?(green-red)/total:0;
    const coverage=total/(Math.ceil(w/step)*Math.ceil(h/step));
    let signal="AGUARDAR",strength="Fraca",reason="Poucas evidências visuais ou sinais mistos.";
    if(total<35){reason="Não foram encontrados pixels coloridos suficientes. Ajuste a região para incluir os candles."; }
    else if(dominance>.12&&delta>0){signal="ALTA";strength=dominance>.32?"Forte":"Moderada";reason="Predomínio de pixels verdes e maior pressão visual na parte recente da região.";}
    else if(dominance<-.12&&delta<0){signal="BAIXA";strength=dominance<-.32?"Forte":"Moderada";reason="Predomínio de pixels vermelhos e maior pressão visual vendedora na parte recente da região.";}
    else {reason="As cores estão equilibradas ou a distribuição recente não confirma uma direção. Melhor aguardar.";}
    return {signal,strength,reason,green,red,greenPct,redPct,total,coverage,dominance,delta,asset:$("assetName").value||"Ativo não informado",market:$("marketType").value,period:$("candlePeriod").value,time:new Date().toLocaleString("pt-BR")};
  }
  function renderResult(a){
    const main=$("resultMain");main.className="result-main "+(a.signal==="ALTA"?"bull":a.signal==="BAIXA"?"bear":"");
    const symbol=a.signal==="ALTA"?"↗":a.signal==="BAIXA"?"↘":"⌁";
    main.innerHTML=`<div class="result-symbol">${symbol}</div><div><strong>${a.signal} · PRESSÃO ${a.strength.toUpperCase()}</strong><p>${a.reason}</p></div>`;
    $("analysisStatus").textContent="ANÁLISE CONCLUÍDA";
    $("greenMetric").textContent=a.green.toLocaleString("pt-BR");$("redMetric").textContent=a.red.toLocaleString("pt-BR");
    $("greenMeter").style.width=a.greenPct+"%";$("redMeter").style.width=a.redPct+"%";
    $("trendMetric").textContent=a.signal;
    const labels=["1","2","3","4","5"];
    $("horizonGrid").innerHTML=labels.map(n=>{
      const status=a.signal==="AGUARDAR"?"AGUARDAR":a.signal;
      const sub=a.signal==="AGUARDAR"?"Sem confirmação":"Leitura visual atual";
      return `<div class="horizon ${status==="ALTA"?"bull":status==="BAIXA"?"bear":""}"><small>${n} MIN</small><b>${status==="ALTA"?"↑ ALTA":status==="BAIXA"?"↓ BAIXA":"—"}</b><span>${sub}</span></div>`;
    }).join("");
    $("explanation").innerHTML=`<strong>Interpretação responsável</strong><p>${a.reason} Esta leitura descreve apenas a imagem capturada; ela não calcula a probabilidade real de o preço subir ou cair nos próximos ${labels.join(", ")} minutos. Para isso seriam necessários dados históricos e cotações contínuas, com validação estatística.</p>`;
    saveHistory(a);
  }
  $("analyzeBtn").addEventListener("click",()=>{
    try{const a=analyze();if(!a)return;renderResult(a);$("resultsPanel").scrollIntoView({behavior:"smooth",block:"start"});showToast("Leitura visual concluída.");}
    catch(e){showToast("Falha na análise. Tente selecionar novamente a área dos candles.");console.error(e);}
  });

  function getHistory(){try{return JSON.parse(localStorage.getItem("tav_history")||"[]");}catch{return [];}}
  function saveHistory(a){const h=getHistory();h.unshift(a);localStorage.setItem("tav_history",JSON.stringify(h.slice(0,30)));renderHistory();}
  function renderHistory(){
    const h=getHistory();$("historyList").innerHTML=h.length?h.map(a=>`<div class="history-item"><div><strong>${escapeHtml(a.asset)} · ${escapeHtml(a.market)}</strong><small>${escapeHtml(a.time)} · ${escapeHtml(a.period)}</small></div><span class="history-signal ${a.signal==="ALTA"?"bull":a.signal==="BAIXA"?"bear":"neutral"}">${a.signal}</span></div>`).join(""):'<div class="history-empty">Nenhuma análise registrada ainda.</div>';
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  $("clearHistory").addEventListener("click",()=>{localStorage.removeItem("tav_history");renderHistory();showToast("Histórico apagado.");});
  renderHistory();

  if("serviceWorker" in navigator && location.protocol.startsWith("http")) window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
})();