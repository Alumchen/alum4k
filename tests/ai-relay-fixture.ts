export const relayFixture = `<!doctype html><meta charset="utf-8"><title>Local relay contract fixture</title>
<style>body{font:16px/1.8 Arial;background:#fff;color:#19313a}main{max-width:720px;margin:20px auto}article{padding:18px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:7px 18px}pre{background:#18252b;color:#a9e0bd;padding:16px}h2{font-size:24px;color:#137c71}img{display:block;max-width:100%}</style><main><div id="messages"></div><textarea id="prompt-textarea"></textarea><input type="file" accept="image/png,image/jpeg,image/webp" hidden multiple><div id="attachments"></div><button data-testid="send-button">Send</button></main>
<script>
const state=localStorage.getItem('fixture-state')||'ready';
if(state==='login'){const b=document.createElement('button');b.dataset.testid='login-button';b.textContent='Log in';document.body.append(b);}
else if(state==='verify'){const x=document.createElement('p');x.textContent='Verify you are human';document.body.append(x);}
else{const b=document.createElement('button');b.dataset.testid='accounts-profile-button';b.textContent='Fixture account';document.body.append(b);}
let id=location.pathname.startsWith('/c/')?location.pathname.split('/')[2]:'';
let history=JSON.parse(localStorage.getItem('thread-'+id)||'[]');
const root=document.getElementById('messages');
document.querySelector('input[type=file]').onchange=event=>{const files=Array.from(event.target.files);localStorage.setItem('fixture-upload-count',String(files.length));for(const file of files){const img=document.createElement('img');img.dataset.testid='attachment-preview';img.src=URL.createObjectURL(file);img.width=80;document.getElementById('attachments').append(img);}};
function add(role,text,copy=false){const x=document.createElement('article');x.dataset.messageAuthorRole=role;const content=document.createElement('div');content.className=role==='assistant'?'markdown':'user-content';content.textContent=text;x.append(content);if(copy){const b=document.createElement('button');b.dataset.testid='copy-turn-action-button';b.textContent='Copy';x.append(b);}root.append(x);return x;}
for(const m of history)add(m.role,m.text,m.role==='assistant');
if(state==='old'){add('assistant','OLD RESPONSE MUST NOT RETURN',true);document.getElementById('prompt-textarea').remove();}
document.querySelector('[data-testid="send-button"]').onclick=()=>{
const editor=document.getElementById('prompt-textarea');const prompt=editor.value;if(!prompt)return;
localStorage.setItem('fixture-sends',String(Number(localStorage.getItem('fixture-sends')||0)+1));
if(!id){id=crypto.randomUUID();history=[];window.history.replaceState({},'', '/c/'+id);}
add('user',prompt);history.push({role:'user',text:prompt});editor.value='';
if(prompt.includes('限流')){const alert=document.createElement('div');alert.setAttribute('role','alert');alert.textContent='Usage limit reached';document.body.append(alert);return;}
const stop=document.createElement('button');stop.dataset.testid='stop-button';stop.textContent='Stop';document.body.append(stop);
const answer=add('assistant','处理中…');
if(prompt.includes('长时间')){stop.onclick=()=>stop.remove();return;}
setTimeout(()=>{const body=answer.querySelector('.markdown');body.replaceChildren();const heading=document.createElement('h2');heading.textContent='测试网页回复：'+prompt;body.append(heading);const note=document.createElement('p');note.innerHTML='<strong>仅为本地合同测试，不是真实 ChatGPT 回复。</strong>';body.append(note);const table=document.createElement('table');table.innerHTML='<thead><tr><th>项目</th><th>结果</th></tr></thead><tbody><tr><td>图片与排版</td><td>本地测试</td></tr></tbody>';body.append(table);const pre=document.createElement('pre');const code=document.createElement('code');code.textContent='const result = "图文测试";';pre.append(code);body.append(pre);const canvas=document.createElement('canvas');canvas.width=240;canvas.height=90;const ctx=canvas.getContext('2d');ctx.fillStyle='#176a7c';ctx.fillRect(0,0,240,90);ctx.fillStyle='#d5ed96';ctx.fillRect(24,18,72,54);ctx.fillStyle='#fff';ctx.font='16px Arial';ctx.fillText('LOCAL TEST',108,50);const image=document.createElement('img');image.src=canvas.toDataURL();image.width=240;image.height=90;body.append(image);if(prompt.includes('只返回图片'))body.replaceChildren(image);const text=body.innerText;const b=document.createElement('button');b.dataset.testid='copy-turn-action-button';b.textContent='Copy';answer.append(b);stop.remove();history.push({role:'assistant',text});localStorage.setItem('thread-'+id,JSON.stringify(history));},250);
};
</script>`;
