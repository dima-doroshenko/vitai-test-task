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
const submitContent=submit.innerHTML;
const phone=form.elements.phone;
function phoneDigits(value){let digits=value.replace(/\D/g,'');if(digits.startsWith('810375'))digits=digits.slice(6);else if(digits.startsWith('375'))digits=digits.slice(3);else if(digits.startsWith('80'))digits=digits.slice(2);else if(digits.length===10&&digits[0]==='0')digits=digits.slice(1);return digits.slice(0,9);}
function formatPhone(digits){return digits?`+375 (${digits.slice(0,2)}${digits.length>=2?')':''}${digits.length>2?` ${digits.slice(2,5)}`:''}${digits.length>5?`-${digits.slice(5,7)}`:''}${digits.length>7?`-${digits.slice(7,9)}`:''}`:'+375';}
phone.value=formatPhone('');
phone.setSelectionRange(phone.value.length,phone.value.length);
phone.addEventListener('input',()=>{const digits=phoneDigits(phone.value),before=phoneDigits(phone.value.slice(0,phone.selectionStart)).length;phone.value=formatPhone(digits);let caret=6,count=0;for(let i=6;i<phone.value.length&&count<Math.min(before,digits.length);i++)if(/\d/.test(phone.value[i])){caret=i+1;count++;}phone.setSelectionRange(caret,caret);});
function error(k,message=''){const input=form.elements[k],target=document.querySelector(`#${k}-error`);if(input&&target){target.textContent=message;if(message)input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');}}
for(const k of fields)form.elements[k].addEventListener('input',()=>error(k));
document.querySelectorAll('[data-interest]').forEach(link=>link.addEventListener('click',()=>{form.elements.interest.value=link.dataset.interest;form.elements.context.value=link.dataset.context||'';const label=document.querySelector('#context-label');label.hidden=!link.dataset.context;label.textContent=link.dataset.context?`Вы выбрали: ${link.dataset.context}`:'';error('interest');}));
form.addEventListener('submit',async event=>{
event.preventDefault();if(sending)return;status.textContent='';status.className='';fields.forEach(k=>error(k));const data=Object.fromEntries(new FormData(form)),errors={};
if(!data.name.trim())errors.name='Подскажите, как к вам обращаться.';else if(data.name.length>80)errors.name='Имя должно быть не длиннее 80 символов.';
const phone=normalizePhone(data.phone);if(!phone)errors.phone='Проверьте номер.';
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
finally{sending=false;submit.disabled=false;submit.innerHTML=submitContent;submit.removeAttribute('aria-busy');if(!form.querySelector('[aria-invalid="true"]'))status.focus({preventScroll:false});}
});
