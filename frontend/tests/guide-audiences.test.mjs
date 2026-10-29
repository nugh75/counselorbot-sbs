// Guide journeys on a production build; APIs and identities are synthetic.
import assert from 'node:assert/strict';
import {after,before,test} from 'node:test';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {guideTaskCopy} from '../src/lib/i18n-guide-tasks.ts';
import {guideUIText} from '../src/lib/i18n-guide-ui.ts';
import {guideTaskHref} from '../src/lib/guide-tasks.ts';
const origin=process.env.GUIDE_BASE_URL||'http://127.0.0.1:3164';
let browser;
before(async()=>{browser=await chromium.launch({headless:true});mkdirSync('../output/playwright',{recursive:true});});
after(async()=>{await browser?.close();});
async function fixture({lang='it',width=390,role='student',features=false,dark=false}={}){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
 await context.addInitScript(({lang,dark})=>{localStorage.setItem('cb_lang',lang);localStorage.setItem('cb_theme',dark?'dark':'light');},{lang,dark});
 const page=await context.newPage(),errors=[],writes=[];page.setDefaultTimeout(15000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!==origin)return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  if(req.method()!=='GET'){writes.push(url.pathname);return route.fulfill({json:{}});}
  let data=[];
  if(url.pathname==='/api/auth/me')data={authenticated:role!=='guest',username:'guide.demo',groups:role==='teacher'?['docenti']:[],is_admin:role==='admin'};
  else if(url.pathname==='/api/user/account-preferences')data={counselor_ready:true,notebook_ready:true,setup_completed:true};
  else if(url.pathname==='/api/orientation/status')data={required:false,completed:true};
  else if(url.pathname==='/api/user/api-settings')data={available:features};
  else if(url.pathname==='/api/user/chatgpt')data={enabled:features};
  return route.fulfill({json:data});
 });
 return{page,context,errors,writes,l:key=>guideUIText(lang,key),copy:id=>guideTaskCopy(lang,id)};
}
for(const lang of ['it','en','es','fr','de','sv'])for(const width of [390,1440]){
 test(`student searches, reads one procedure and returns: ${lang}/${width}`,async()=>{
  const f=await fixture({lang,width,dark:lang==='de'}),{page,l,copy}=f;
  try{
   await page.goto(`${origin}/guide?audience=student`);const root=page.getByTestId('guide');
   const topics=root.getByRole('navigation',{name:l('all'),exact:true});await topics.waitFor();
   assert.equal(await root.locator('article').count(),0);
   assert.equal(await topics.locator(':scope > section').count(),6);
   assert.ok((await root.locator(`a[href="${guideTaskHref('start')}"]`).boundingBox()).y<900);
   await page.screenshot({path:`../output/playwright/guide-home-${lang}-${width}.png`});
   await page.getByRole('searchbox',{name:l('search'),exact:true}).fill(copy('resume').title);
   await root.getByRole('heading',{name:l('results'),exact:true}).waitFor();
   assert.equal(new URL(page.url()).searchParams.get('q'),copy('resume').title);
   const link=root.locator(`a[href="${guideTaskHref('resume')}"]`);await link.focus();await page.keyboard.press('Enter');
   const article=page.locator('#guide-task-resume');await article.waitFor();
   assert.equal(await root.locator('article').count(),1);
   assert.equal(await article.locator('[data-testid="guide-steps"] > li').count(),3);
   assert.equal(await article.locator('figure').count(),1);
   assert.ok((await article.innerText()).split(/\s+/).length<170);
   assert.equal(await article.getByRole('link',{name:l('open'),exact:true}).getAttribute('href'),'/profilo/piani-operativi');
   assert.equal(await page.locator('#guide-task-title').evaluate(el=>el===document.activeElement),true);
   const trigger=article.getByRole('button',{name:`${l('zoom')}: ${copy('resume').title}`,exact:true});
   await trigger.click();const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.locator('img').evaluate(img=>img.decode());
   await page.keyboard.press('Tab');assert.equal(await dialog.getByRole('button').evaluate(el=>el===document.activeElement),true);
   await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
   assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
   await article.locator('..').evaluate(el=>el.scrollIntoView({block:'start'}));
   await page.screenshot({path:`../output/playwright/guide-task-${lang}-${width}.png`});
   await page.goBack();assert.equal(await page.getByRole('searchbox').inputValue(),copy('resume').title);
   await page.reload();assert.equal(await page.getByRole('searchbox').inputValue(),copy('resume').title);
   await root.locator(`a[href="${guideTaskHref('resume')}"]`).waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);
  }finally{await f.context.close();}
 });
 test(`teacher and admin bookmarks keep role-specific help: ${lang}/${width}`,async()=>{
  const f=await fixture({lang,width,role:'admin',features:true}),{page,l}=f;
  try{
   await page.goto(`${origin}/guide?audience=teacher#guide-teacher-section-9`);await page.locator('#guide-task-build-plan').waitFor();
   const chooser=page.getByRole('navigation',{name:l('audience'),exact:true});
   assert.equal(await chooser.getByRole('link',{name:l('teacher'),exact:true}).getAttribute('aria-current'),'page');
   assert.equal(await page.locator('article').count(),1);
   await chooser.getByRole('link',{name:l('admin'),exact:true}).click();
   await page.locator(`a[href="${guideTaskHref('admin-classes','admin')}"]`).waitFor();
   assert.equal(await page.locator(`a[href="${guideTaskHref('resume')}"]`).count(),0);
   await page.goto(`${origin}/guide?audience=teacher#guide-admin-class-settings`);await page.locator('#guide-task-admin-classes').waitFor();
   assert.equal(await page.locator('article').getByRole('link',{name:l('open'),exact:true}).getAttribute('href'),'/admin?tab=groupsClasses');
   await page.goto(`${origin}/guide?audience=student#guide-chat-controls`);await page.locator('#guide-task-chat').waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);
  }finally{await f.context.close();}
 });
}
test('public help, unknown links and disabled integrations recover without privileged content',async()=>{
 const f=await fixture({role:'guest'}),{page,l}=f;
 try{
  await page.goto(`${origin}/guide?audience=admin&task=admin-classes`);await page.getByText(l('unavailable'),{exact:true}).waitFor();
  assert.equal(await page.locator('article').count(),0);
  await page.goto(`${origin}/guide?audience=teacher&task=build-plan`);await page.locator('#guide-task-build-plan').waitFor();
  assert.equal(await page.getByRole('navigation',{name:l('audience'),exact:true}).count(),0);
  await page.goto(`${origin}/guide?audience=student&task=personal-api`);await page.getByText(l('unavailable'),{exact:true}).waitFor();
  await page.goto(`${origin}/guide?task=unknown`);await page.getByText(l('unavailable'),{exact:true}).waitFor();
  await page.getByRole('link',{name:l('back'),exact:true}).click();await page.getByRole('navigation',{name:l('all'),exact:true}).waitFor();await page.getByRole('searchbox').fill('zzzzzzzzzzzz');
  await page.getByText(l('empty'),{exact:true}).waitFor();assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);
 }finally{await f.context.close();}
});
