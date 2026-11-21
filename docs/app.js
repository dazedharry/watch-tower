(function(){
"use strict";
const SITE=window.SITE;
const TZ="Europe/London";
const partsFmt=new Intl.DateTimeFormat("en-GB",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
function ukParts(date){const o={};partsFmt.formatToParts(date).forEach(p=>{o[p.type]=p.value});return {day:`${o.year}-${o.month}-${o.day}`,hour:+o.hour,min:+o.minute};}
const dayLabelFmt=new Intl.DateTimeFormat("en-GB",{timeZone:TZ,weekday:"short",day:"numeric",month:"short"});
const timeFmt=new Intl.DateTimeFormat("en-GB",{timeZone:TZ,hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
const dateTimeFmt=new Intl.DateTimeFormat("en-GB",{timeZone:TZ,weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
function dayLabel(d){return dayLabelFmt.format(new Date(d+"T12:00:00Z"));}
function shiftDay(d,n){const x=new Date(d+"T12:00:00Z");x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);}

const N_COLOURS=12;
const SLUG_OF={};
function hash(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))>>>0;return h;}
function colourOf(label){
  const slug=SLUG_OF[label]||label.toLowerCase();
  let i=(SITE.order||[]).indexOf(slug);
  if(i<0)i=hash(slug)%N_COLOURS;
  return `var(--c${i%N_COLOURS})`;
}
function safeHref(u){return /^https?:\/\//i.test(u)?u:"#";}
function h(tag,attrs,...kids){
  const el=document.createElement(tag);
  for(const k in (attrs||{})){
    if(k==="class")el.className=attrs[k];else if(k==="text")el.textContent=attrs[k];
    else if(k==="style")el.setAttribute("style",attrs[k]);else el.setAttribute(k,attrs[k]);
  }
  kids.flat().forEach(c=>{if(c!=null)el.append(c.nodeType?c:document.createTextNode(c));});
  return el;
}
const $=id=>document.getElementById(id);
function clear(el){while(el.firstChild)el.removeChild(el.firstChild);}

const STOP=new Set("the a an and or but of to in on at for with from by as is are was were be been it its this that these those he she they his her their him them you your we our i my me not no after before over under into out up down off new says say said will would could can may just more most than then now how why what when who whom which about back first one two three amid against during while also still all any get gets got has have had having do does did doing here there very much many some such only own same so too if ever even again once until because between through above below further both each other few nor".split(" "));
function tokens(t){return t.toLowerCase().replace(/[’']s\b/g,"").replace(/[^a-z0-9£$%\s-]/g," ").split(/\s+/).filter(Boolean);}

let DATA=null,ALL=[],today="";

function enrich(raw){
  return raw.map(s=>{
    const d=new Date(s.published),p=ukParts(d);
    const label=s.category_label||s.category||"Other";
    SLUG_OF[label]=s.category||label.toLowerCase();
    return Object.assign({},s,{date:d,day:p.day,hourF:p.hour+p.min/60,section:label});
  });
}

function render(){
  const now=new Date();today=ukParts(now).day;
  const pn=ukParts(now),nowHourF=pn.hour+pn.min/60;
  const gen=new Date(DATA.generated_at),ageH=(now-gen)/36e5;
  const st=$("status");
  st.textContent=`Archive updated ${dateTimeFmt.format(gen)} UK time · ${ALL.length} articles stored`;
  st.className="status"+(ageH>8?" stale":"");
  if(ageH>8)st.textContent+=` · No update for ${Math.floor(ageH)} hours, check the workflow`;

  const byDay={};ALL.forEach(s=>{(byDay[s.day]=byDay[s.day]||[]).push(s);});
  const earliest=ALL.length?ALL[ALL.length-1].day:today;
  const prev7=[];for(let i=1;i<=7;i++){const d=shiftDay(today,-i);if(d>=earliest)prev7.push(d);}

  const cToday={},c7={};
  (byDay[today]||[]).forEach(s=>{cToday[s.section]=(cToday[s.section]||0)+1;});
  prev7.forEach(d=>(byDay[d]||[]).forEach(s=>{c7[s.section]=(c7[s.section]||0)+1;}));
  const allCats=[...new Set(ALL.map(s=>s.section))];
  const total7=Object.values(c7).reduce((a,b)=>a+b,0);
  const byVol=allCats.slice().sort((a,b)=>((c7[b]||0)+(cToday[b]||0))-((c7[a]||0)+(cToday[a]||0)));

  const todayN=(byDay[today]||[]).length;
  const avg=prev7.length?prev7.reduce((a,d)=>a+(byDay[d]||[]).length,0)/prev7.length:null;
  const hours=Array(24).fill(0);prev7.forEach(d=>(byDay[d]||[]).forEach(s=>{hours[Math.floor(s.hourF)]++;}));
  const peak=hours.indexOf(Math.max(...hours));
  const bylinesToday=new Set((byDay[today]||[]).map(s=>s.author).filter(Boolean)).size;
  const hasAuthors=ALL.some(s=>s.author);
  const nums=$("nums");clear(nums);
  const cells=[[todayN,"articles today so far"],[avg==null?"–":avg.toFixed(avg<10?1:0),`average per day, last ${prev7.length||0} full days`],[total7?`${String(peak).padStart(2,"0")}:00`:"–","busiest hour of the day"]];
  if(hasAuthors)cells.push([bylinesToday,"bylines active today"]);
  cells.forEach(([n,l])=>nums.append(h("div",{class:"num"},h("b",{text:String(n)}),h("span",{text:l}))));

  const legend=$("legend");clear(legend);
  byVol.slice(0,12).forEach(c=>legend.append(h("span",{},h("i",{style:`background:${colourOf(c)}`}),c)));

  // ribbons
  const ribbons=$("ribbons");clear(ribbons);
  const days=[];for(let i=0;i<7;i++)days.push(shiftDay(today,-i));
  days.forEach((d,i)=>{
    const list=byDay[d]||[];const track=h("div",{class:"ribbon"});
    list.forEach(s=>{
      const a=h("a",{href:safeHref(s.link),target:"_blank",rel:"noopener",style:`left:${(s.hourF/24*100).toFixed(3)}%;background:${colourOf(s.section)}`,"aria-label":`${timeFmt.format(s.date)} ${s.section}: ${s.title}`});
      const show=()=>{const cap=$("caption");clear(cap);cap.append(h("strong",{text:s.title}),h("br"),h("small",{text:`${timeFmt.format(s.date)} · ${s.section}${s.author?" · "+s.author:""}`}));};
      a.addEventListener("mouseenter",show);a.addEventListener("focus",show);track.append(a);
    });
    if(i===0)track.append(h("div",{style:`position:absolute;left:${(nowHourF/24*100).toFixed(2)}%;top:0;bottom:0;width:2px;background:var(--fg)`,"aria-hidden":"true"}));
    ribbons.append(h("div",{class:"ribbon-row"},h("div",{class:"d",text:i===0?"Today":dayLabel(d)}),track,h("div",{class:"n",text:String(list.length)})));
  });
  const axis=$("axis");clear(axis);
  [0,6,12,18,24].forEach(hr=>axis.append(h("span",{style:`left:${hr/24*100}%`,text:String(hr).padStart(2,"0")+":00"})));

  // daily bars, last 14 days
  const dayList=[];for(let i=13;i>=0;i--)dayList.push(shiftDay(today,-i));
  const max=Math.max(1,...dayList.map(d=>(byDay[d]||[]).length));
  const bars=$("bars");clear(bars);const bl=$("barlabels");clear(bl);
  dayList.forEach(d=>{
    const list=byDay[d]||[];
    const col=h("div",{class:"bar",title:`${dayLabel(d)}: ${list.length} articles`});
    const counts={};list.forEach(s=>{counts[s.section]=(counts[s.section]||0)+1;});
    byVol.forEach(c=>{if(counts[c])col.append(h("div",{style:`height:${(counts[c]/max*180).toFixed(1)}px;background:${colourOf(c)}`,title:`${c}: ${counts[c]}`}));});
    col.append(h("span",{class:"tot",text:list.length?String(list.length):""}));
    bars.append(col);
    bl.append(h("span",{text:d===today?"Today":dayLabel(d).split(" ")[0]+" "+d.slice(8)}));
  });
  $("daily-sub").textContent=`Last 14 days. The archive starts ${dayLabel(earliest)}, so earlier days stay blank. Today is incomplete.`;

  // categories table
  const tb=$("sections");clear(tb);
  byVol.forEach(c=>{
    const a7=prev7.length?(c7[c]||0)/prev7.length:0;
    tb.append(h("tr",{},h("td",{},h("i",{style:`background:${colourOf(c)}`}),c),h("td",{class:"r",text:String(cToday[c]||0)}),h("td",{class:"r",text:a7.toFixed(1)}),h("td",{class:"r",text:total7?Math.round((c7[c]||0)/total7*100)+"%":"–"})));
  });

  // left panel: bylines if the feed has them, otherwise feed keywords
  const pool=days.flatMap(d=>byDay[d]||[]);
  const left=$("left-h"),leftSub=$("left-sub");
  let entries;
  if(hasAuthors){
    left.textContent="Most published bylines";leftSub.textContent="Last 7 days. Select a name to filter the article list.";
    const ac={};pool.forEach(s=>{if(s.author)ac[s.author]=(ac[s.author]||0)+1;});
    entries=Object.entries(ac);
  }else{
    left.textContent="Most used feed keywords";leftSub.textContent="Last 7 days. This feed carries no bylines, so keywords stand in. Select one to filter the article list.";
    const kc={};pool.forEach(s=>(s.keywords||[]).forEach(k=>{kc[k]=(kc[k]||0)+1;}));
    entries=Object.entries(kc);
  }
  entries=entries.sort((a,b)=>b[1]-a[1]).slice(0,10);
  const pick=v=>{$("q").value=v;applyFilters();$("h-latest").scrollIntoView({behavior:"smooth"});};
  fillList($("authors"),entries,pick);

  // headline terms
  const tc={};
  pool.forEach(s=>{
    const raw=tokens(s.title);const seen=new Set(raw.filter(t=>!STOP.has(t)&&t.length>2));
    for(let i=0;i<raw.length-1;i++){const a=raw[i],b=raw[i+1];if(!STOP.has(a)&&!STOP.has(b)&&a.length>2&&b.length>2)seen.add(a+" "+b);}
    seen.forEach(t=>{tc[t]=(tc[t]||0)+1;});
  });
  let terms=Object.entries(tc).filter(([,c])=>c>=2).sort((a,b)=>b[1]-a[1]||b[0].length-a[0].length);
  const pairs=terms.filter(([t])=>t.includes(" "));
  terms=terms.filter(([t,c])=>t.includes(" ")||!pairs.some(([p,pc])=>p.split(" ").includes(t)&&pc===c)).slice(0,12);
  fillList($("terms"),terms,pick);

  const sel=$("sec");const keep=sel.value;clear(sel);
  sel.append(h("option",{value:"",text:"All categories"}));
  byVol.forEach(c=>sel.append(h("option",{value:c,text:c})));sel.value=keep;
  applyFilters();
}

function fillList(ul,entries,onPick){
  clear(ul);
  if(!entries.length){ul.append(h("li",{style:"--w:0"},"Not enough data yet."));return;}
  const max=entries[0][1];
  entries.forEach(([name,c])=>{
    const b=h("button",{type:"button",text:name});b.addEventListener("click",()=>onPick(name));
    ul.append(h("li",{style:`--w:${(c/max*100).toFixed(0)}%`},b,h("span",{class:"c",text:String(c)})));
  });
}

function applyFilters(){
  const q=$("q").value.trim().toLowerCase(),sec=$("sec").value;
  const rows=ALL.filter(s=>(!sec||s.section===sec)&&(!q||(s.title+" "+(s.author||"")+" "+(s.summary||"")+" "+(s.keywords||[]).join(" ")).toLowerCase().includes(q)));
  const box=$("latest");clear(box);
  rows.slice(0,60).forEach(s=>{
    box.append(h("div",{class:"story"},
      h("time",{datetime:s.published,text:s.day===today?timeFmt.format(s.date):dayLabel(s.day).split(" ").slice(0,2).join(" ")}),
      h("div",{},h("h3",{},h("a",{href:safeHref(s.link),target:"_blank",rel:"noopener",text:s.title})),
        h("p",{},h("span",{class:"tag",style:`background:${colourOf(s.section)}`}),`${s.section}${s.author?" · "+s.author:""}`))));
  });
  if(!rows.length)box.append(h("p",{class:"sub",text:"No articles match."}));
  $("latest-sub").textContent=`Showing ${Math.min(60,rows.length)} of ${rows.length} matching articles, newest first.`;
}

async function load(){
  try{
    const res=await fetch(`data/${SITE.id}.json`,{cache:"no-store"});
    if(!res.ok)throw new Error("HTTP "+res.status);
    DATA=await res.json();ALL=enrich(DATA.stories||[]);
    if(!ALL.length)throw new Error("empty");
    $("err").hidden=true;$("main").hidden=false;render();
  }catch(e){
    const err=$("err");err.hidden=false;$("main").hidden=true;$("status").textContent="No data";clear(err);
    err.append(h("p",{text:"The article archive could not be loaded."}),
      h("p",{},"Run ",h("code",{text:"python fetch_feeds.py"})," first. When viewing locally, serve the docs folder with ",h("code",{text:"python -m http.server --directory docs"})," because browsers block file loading from a file address."));
  }
}
$("q").addEventListener("input",applyFilters);$("sec").addEventListener("change",applyFilters);
load();setInterval(load,15*60*1000);
})();
