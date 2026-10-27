import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {chromium} from 'playwright';
const origin = process.env.QPCC_FORMAT_BASE_URL || 'http://127.0.0.1:3159';
let browser;
before(async () => {browser = await chromium.launch({headless: true});});
after(async () => {await browser?.close();});
const prose = 'Una lettura del profilo con una spiegazione completa che deve andare a capo nella chat senza spostare il testo fuori dallo schermo. '.repeat(5);
const raw = prose + '\n\n| Fattore | Stanina | Significato | Indicazione |\n| :---- | ---: | :---: | :' + '-'.repeat(53776) + '</small>\n'
    + '| A1 | 5 | Una percezione da approfondire. | Un esempio sintetico e leggibile. |\n'
    + '| M3 | 7 | Un’altra scala. | ULTIMA COLONNA LEGGIBILE |\n\n'
    + '```json\n{"recommendations":{"notes":[]}}\n```\n\nDomanda sintetica finale?';

async function fixture(width) {
    const context = await browser.newContext({viewport:{width,height:1000}, reducedMotion:'reduce'});
    const page = await context.newPage(); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(180000);
    const state = {errors:[], chatCalls:0, messages:raw};
    await page.addInitScript(() => {localStorage.setItem('cb_lang','it');localStorage.setItem('cb_theme','light');localStorage.setItem('counselorbot_selected_counselor','1');});
    page.on('pageerror',e=>state.errors.push(e.message));
    await page.route('**/*',route=>{
        const req=route.request(),u=new URL(req.url());
        if(u.origin!==origin) return route.abort();
        if(!u.pathname.startsWith('/api/')) return route.continue();
        const json=(body)=>route.fulfill({json:body});
        if(u.pathname==='/api/auth/me') return json({authenticated:true,username:'synthetic',name:'Prova',is_admin:false,groups:['studenti']});
        if(u.pathname==='/api/user/access') return json({restricted:false,tool_keys:['QPCC'],counselor_ids:null,class_ids:[1]});
        if(u.pathname==='/api/user/account-preferences'||u.pathname==='/api/user/account') return json({counselor_id:1,counselor_ready:true,notebook_ready:true,setup_completed:true});
        if(u.pathname==='/api/orientation/status') return json({required:false,completed:true});
        if(u.pathname==='/api/counselors') return json([{id:1,name:'Counselor sintetico',is_active:true,suitable:true,language:['it']}]);
        if(u.pathname.endsWith('/deep-dive')) return json({personal:false,ready:true,source_href:'/profilo/piani-operativi/1/2',results:[],completed:false,
            session:{path_id:1,step_id:3,results_step_id:2,session_id:'format',started_at:'2026-10-27T12:00:00Z',result:{id:1,questionnaire_type:'QPCC',scores:{A1:5,M3:7}}}});
        if(u.pathname==='/api/session/frozen/format') return json({session_id:'format',questionnaire_type:'QPCC',current_phase:'qpcc-profilo',scores:{A1:5,M3:7},locale:'it',counselor_id:1,
            guided_navigation:{visited:['qpcc-profilo'],completed:[],agreement_accepted:true,active_exploration_id:null,explorations:[],checkpoints:{}},
            messages:[{role:'system',content:'--- Lettura del Profilo ---'},{role:'assistant',content:state.messages,phaseId:'qpcc-profilo'}]});
        if(u.pathname==='/api/session/frozen') return json([]);
        if(u.pathname==='/api/qsa/guided-ui-texts') return json({guided_steps:[{id:'qpcc-intro',label:'Patto',sort_order:0,system_prompt_mode:'generic'},
            {id:'qpcc-profilo',label:'Lettura del Profilo',sort_order:1,system_prompt_mode:'generic'}]});
        if(u.pathname.endsWith('/recommendations')) return json({reading:[],strategy:[],advice:[]});
        if(u.pathname==='/api/chat/stream') {
            state.chatCalls++;
            return route.fulfill({contentType:'text/event-stream',body:`data: ${JSON.stringify({display:raw})}\n\ndata: ${JSON.stringify({done:true,response:raw})}\n\n`});
        }
        return json([]);
    });
    await page.goto(`${origin}/profilo/piani-operativi/1/3/approfondimento`,{waitUntil:'domcontentloaded'});
    return {page,context,state};
}

for(const width of [390,1024,1440,2048]) test(`saved QPCC tables fit the chat and hide internal metadata at ${width}px`,async()=>{
    const {page,context,state}=await fixture(width);
    try{
        const log=page.getByRole('log');await log.getByText('Domanda sintetica finale?',{exact:true}).waitFor();
        assert.equal(await log.locator('table th').count(),4);
        assert.equal(await log.locator('table tbody tr').count(),2);
        const visible=await log.innerText();
        assert.ok(!visible.includes('recommendations')&&!visible.includes('notes')&&!visible.includes('</small>'));
        assert.ok(!visible.includes('----'));
        assert.equal(state.chatCalls,0);
        const geometry=await log.evaluate(el=>{
            const table=el.querySelector('table'),scroller=table.parentElement,bubble=table.closest('.chat-message');
            const message=el.getBoundingClientRect(),bounds=bubble.getBoundingClientRect();
            scroller.scrollLeft=scroller.scrollWidth;
            return {pageFits:document.documentElement.scrollWidth<=innerWidth+1,bubbleFits:bounds.right<=message.right+1&&bounds.left>=message.left-1,
                tableIsReachable:table.rows[0].cells[3].getBoundingClientRect().right<=scroller.getBoundingClientRect().right+1,
                paragraphFits:[...el.querySelectorAll('p')].every(p=>p.getBoundingClientRect().right<=message.right+1&&p.scrollWidth<=p.clientWidth+1)};
        });
        assert.deepEqual(geometry,{pageFits:true,bubbleFits:true,tableIsReachable:true,paragraphFits:true});
        await log.locator('table').evaluate(table=>{table.parentElement.scrollLeft=0;});
        await page.screenshot({path:`output/playwright/qpcc-format-${width}.png`,fullPage:true});
        assert.deepEqual(state.errors,[]);
    } finally{await context.close();}
});

test('new streamed QPCC replies use the same repair as saved history',async()=>{
    const {page,context,state}=await fixture(390);
    try{
        const log=page.getByRole('log');await log.getByText('Domanda sintetica finale?',{exact:true}).waitFor();
        await page.locator('#guided-composer').fill('Vorrei un chiarimento.');
        await page.getByRole('button',{name:'Invia',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('[role="log"] table').length===2);
        assert.equal(state.chatCalls,1);
        assert.ok(!(await log.innerText()).includes('recommendations'));
        assert.deepEqual(state.errors,[]);
    } finally{await context.close();}
});
