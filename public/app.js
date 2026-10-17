import { normalizePhone } from './phone.js';
const keys=['utm_source','utm_medium','utm_campaign','utm_content','utm_term','yclid','fbclid','gclid'];
function cleanUrl(value){try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol))return '';const c=new URL(u.origin+u.pathname);for(const k of keys){const v=u.searchParams.get(k);if(v)c.searchParams.set(k,v.slice(0,180));}return c.href.slice(0,600);}catch{return '';}}
const url=new URL(location.href),touch={entry_url:cleanUrl(location.href)};
if(document.referrer)touch.referrer=cleanUrl(document.referrer);
for(const k of keys){const v=url.searchParams.get(k);if(v)touch[k]=v.slice(0,180);}
let first=touch;
try{const saved=JSON.parse(sessionStorage.getItem('kvarta-first-touch'));if(saved&&typeof saved==='object'&&!Array.isArray(saved))first=saved;else sessionStorage.setItem('kvarta-first-touch',JSON.stringify(touch));}catch{/* In-memory attribution works when storage is blocked. */}
const current=keys.some(k=>touch[k])?touch:null;
const form=document.querySelector('#lead-form'),submit=document.querySelector('#submit'),status=document.querySelector('#form-status');
const fields=['name','phone','interest','comment'];submit.disabled=false;let sending=false;
function error(k,message=''){const input=form.elements[k],target=document.querySelector(`#${k}-error`);if(input&&target){target.textContent=message;if(message)input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');}}
for(const k of fields)form.elements[k].addEventListener('input',()=>error(k));
document.querySelectorAll('[data-interest]').forEach(link=>link.addEventListener('click',()=>{form.elements.interest.value=link.dataset.interest;form.elements.context.value=link.dataset.context||'';const label=document.querySelector('#context-label');label.hidden=!link.dataset.context;label.textContent=link.dataset.context?`Вы выбрали: ${link.dataset.context}`:'';error('interest');setTimeout(()=>{if(!sending)form.elements.name.focus({preventScroll:true});},matchMedia('(prefers-reduced-motion: reduce)').matches?0:350);}));
form.addEventListener('submit',async event=>{
event.preventDefault();if(sending)return;status.textContent='';status.className='';fields.forEach(k=>error(k));const data=Object.fromEntries(new FormData(form)),errors={};
if(!data.name.trim())errors.name='Подскажите, как к вам обращаться.';else if(data.name.length>80)errors.name='Имя должно быть не длиннее 80 символов.';
const phone=normalizePhone(data.phone);if(!phone)errors.phone='Проверьте белорусский номер и код оператора или города. Например: +375 29 491-19-11.';
if(!['subscription','order','question'].includes(data.interest))errors.interest='Выберите, что вас интересует.';if(data.comment.length>1000)errors.comment='Комментарий — до 1000 символов.';
if(Object.keys(errors).length){Object.entries(errors).forEach(([k,v])=>error(k,v));status.textContent='Проверьте отмеченные поля.';form.elements[Object.keys(errors)[0]].focus();return;}
sending=true;submit.disabled=true;submit.setAttribute('aria-busy','true');submit.textContent='Отправляем…';status.textContent='Отправляем заявку.';
data.phone=phone;data.attribution={first,...(current?{current}:{}),submission_url:cleanUrl(location.href)};
try{const response=await fetch('/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(18000)});const result=await response.json();
if(response.status===201&&result.code==='accepted'){status.textContent='Спасибо! Заявка принята. Менеджер перезвонит, поможет выбрать кофе и оформить заказ.';status.className='success';}
else if(response.status===409&&result.code==='duplicate'){status.textContent='Заявка с этим номером уже принята. Менеджер перезвонит и поможет с заказом. Повторную заявку можно оставить через 10 минут после принятой.';status.className='success';}
else if(response.status===422&&result.fields){for(const[k,v]of Object.entries(result.fields))if(fields.includes(k))error(k,v);status.textContent=result.fields.form||'Проверьте отмеченные поля и попробуйте ещё раз.';const invalid=form.querySelector('[aria-invalid="true"]');if(invalid)invalid.focus();}
else status.textContent=response.status===413?'Заявка слишком большая. Сократите комментарий и попробуйте снова.':'Сервис временно недоступен. Данные сохранены в форме — попробуйте отправить ещё раз.';
}catch{status.textContent='Не удалось получить ответ. Возможно, заявка уже принята. Проверьте соединение и попробуйте ещё раз — повторную заявку мы не создадим в течение 10 минут.';}
finally{sending=false;submit.disabled=false;submit.innerHTML='Оставить заявку <span aria-hidden="true">↗</span>';submit.removeAttribute('aria-busy');if(!form.querySelector('[aria-invalid="true"]'))status.focus({preventScroll:false});}
});
