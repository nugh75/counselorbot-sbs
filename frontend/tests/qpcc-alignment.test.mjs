import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = new URL(process.env.QPCC_BASE_URL || 'http://127.0.0.1:3147').origin;
const schema = JSON.parse(await readFile(new URL('../src/lib/qpcc-schema.json',import.meta.url)));
const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
after(() => browser.close());
const scores = Object.fromEntries(schema.map(f => [f.code,f.code.startsWith('A') || f.code==='M2' ? 9 : 5]));
const steps = ['qpcc-intro','qpcc-profilo','qpcc-comunicazione','qpcc-controllo','qpcc-volizione','qpcc-elaborazione','qpcc-convinzioni','qpcc-sintesi'].map((id,sort_order) => ({id, sort_order, label:id, system_prompt_mode:id==='qpcc-profilo' ? 'qpcc-factor' : id==='qpcc-sintesi' ? 'qpcc-summary' : 'qpcc-interview', color_theme:'slate'}));
const noStrengths = {it:'Nessun fattore nella fascia dei punti di forza.', en:'No factor in the strengths band.', es:'Ningún factor en la franja de fortalezas.', fr:'Aucun facteur dans la zone des points forts.', de:'Kein Faktor im Stärkenbereich.', sv:'Ingen faktor inom styrkeområdet.'};
const sse = value => `data: ${JSON.stringify(value)}\n\n`;

async function fixture(lang, width=390, frozen=false, legacy=false) {
    const context = await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    const page = await context.newPage();page.setDefaultTimeout(30000);
    const errors=[],requests=[];
    page.on('pageerror',error => errors.push(error.message));
    await page.addInitScript(lang => {localStorage.setItem('cb_lang',lang);localStorage.setItem('counselorbot_selected_counselor','1');},lang);
    const snapshot = {session_id:'qpcc-fixture',questionnaire_type:'QPCC',current_phase:'qpcc-intro',experience:'standard',counselor_id:1,locale:lang,scores,messages:[{role:'assistant',content:'QPCC fixture agreement'}]};
    await page.route('**/*',async route => {
        const req=route.request(),url=new URL(req.url());
        if(url.origin !== origin) return route.abort();
        if(!url.pathname.startsWith('/api/')) return route.continue();
        const body = req.postData() ? JSON.parse(req.postData()) : null;
        requests.push({path:url.pathname,body});
        let data=[];
        if(url.pathname==='/api/auth/me') data={authenticated:true,username:'qpcc-test',name:'QPCC fixture',is_admin:false,groups:['studenti']};
        else if(url.pathname==='/api/user/account-preferences') data={counselor_id:1,counselor_ready:true,notebook_ready:true,setup_completed:true};
        else if(url.pathname==='/api/orientation/status') data={required:false};
        else if(url.pathname==='/api/user/access') data={restricted:false,tool_keys:['QPCC'],counselor_ids:[1],default_counselor_id:1,class_ids:[]};
        else if(url.pathname==='/api/counselors') data=[{id:1,slug:'fixture',name:'Counselor fixture',language:['*'],suitable:true,is_active:true}];
        else if(url.pathname==='/api/user/learner-profile') data={profile:{}};
        else if(url.pathname==='/api/user/readings') data=null;
        else if(url.pathname==='/api/user/cross-synthesis/availability') data={available:false,min_instruments:2,instruments:[]};
        else if(url.pathname==='/api/session/frozen') data=[];
        else if(url.pathname==='/api/session/frozen/qpcc-fixture') {
            if(legacy) return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({detail:'qpcc_legacy_profile'})});
            data=snapshot;
        }
        else if(url.pathname==='/api/user/questionnaire-results') data=[{session_id:'old',questionnaire_type:'QPCC',scores:{K1:5,K2:4,K3:5,K4:6,K5:7},submitted_at:'2026-09-01'}];
        else if(url.pathname==='/api/qsa/guided-ui-texts') data={guided_steps:steps,fixed_phase_questions:[]};
        else if(url.pathname.endsWith('/recommendations')) data={reading:[],strategy:[]};
        else if(url.pathname==='/api/questionnaire-result') data={id:2,...body};
        else if(url.pathname==='/api/chat/stream') return route.fulfill({contentType:'text/event-stream',body:sse({display:'QPCC fixture analysis'})+sse({done:true,response:'QPCC fixture analysis'})});
        return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    });
    await page.goto(`${origin}/${frozen?'?frozen=qpcc-fixture':'?start=QPCC'}`);
    return {page,context,errors,requests};
}

for(const lang of ['it','en','es','fr','de','sv']) {
    test(`QPCC ten canonical inputs, scoped names and profile at 390px (${lang})`,async () => {
        const f=await fixture(lang);
        try {
            const method=f.page.getByRole('button').filter({hasText:'A1, A2, A3, V1, V2, C1, C2, M1, M2, M3'});
            await method.dblclick();
            await f.page.locator('input[name="scores.A1"]').waitFor();
            assert.equal(await f.page.locator('input[name^="scores."]').count(),10);
            for(const factor of schema) {
                await f.page.getByText(factor.labels[lang],{exact:true}).first().waitFor();
                await f.page.locator(`input[name="scores.${factor.code}"]`).fill(String(scores[factor.code]));
            }
            assert.equal(await f.page.getByText('K1',{exact:true}).count(),0);
            if(process.env.QPCC_SCREENSHOTS) {
                await mkdir(process.env.QPCC_SCREENSHOTS,{recursive:true});
                await f.page.evaluate(() => window.scrollTo(0,0));
                await f.page.screenshot({path:`${process.env.QPCC_SCREENSHOTS}/qpcc-input-${lang}-390.png`,fullPage:true});
            }
            const submit=f.page.locator('button[type="submit"]');await submit.click();
            await f.page.locator('input[name="scores.A1"]').waitFor({state:'detached'});
            await f.page.getByText(schema.find(f=>f.code==='C2').labels[lang],{exact:true}).first().waitFor();
            assert.ok(await f.page.getByText(schema.find(f=>f.code==='M2').labels[lang],{exact:true}).count());
            await f.page.getByText('1–9',{exact:true}).waitFor();
            await f.page.getByText(noStrengths[lang],{exact:true}).waitFor();
            assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
            if(process.env.QPCC_SCREENSHOTS) {
                await mkdir(process.env.QPCC_SCREENSHOTS,{recursive:true});
                await f.page.screenshot({path:`${process.env.QPCC_SCREENSHOTS}/qpcc-${lang}-390.png`,fullPage:true});
            }
            assert.deepEqual(f.errors,[]);
        } finally {await f.context.close();}
    });
}

test('QPCC frozen guided chat sends ten canonical factor names and keeps agreement explicit', async () => {
    const f=await fixture('it',1440,true);
    try {
        await f.page.getByText('QPCC fixture agreement',{exact:true}).waitFor();
        assert.equal(f.requests.filter(r=>r.path==='/api/chat/stream' && r.body.phase==='qpcc-profilo').length,0);
        await f.page.getByRole('button',{name:'Accetto',exact:true}).click();
        await f.page.getByText('QPCC fixture analysis',{exact:true}).waitFor();
        await f.page.getByRole('log').getByText('QPCC fixture analysis',{exact:true}).first().waitFor();
        await f.page.waitForTimeout(500);
        const request=f.requests.find(r=>r.path==='/api/chat/stream' && r.body.phase==='qpcc-profilo').body;
        for(const factor of schema) assert.ok(request.scores_context.includes(`${factor.code} (${factor.labels.it}): ${scores[factor.code]}/9`));
        assert.equal(request.phase,'qpcc-profilo');
        assert.equal(request.questionnaire_type,'QPCC');
        assert.deepEqual(f.errors,[]);
        if(process.env.QPCC_SCREENSHOTS) await f.page.screenshot({path:`${process.env.QPCC_SCREENSHOTS}/qpcc-chat-it-1440.png`,fullPage:true});
    } finally {await f.context.close();}
});

test('obsolete frozen QPCC explains that a new ten-factor profile is required',async () => {
    const f=await fixture('it',390,true,true);
    try {
        await f.page.getByText('Questo vecchio profilo K1–K5 non può essere riutilizzato: inserisci un nuovo profilo QPCC con dieci stanine.',{exact:true}).waitFor();
        assert.equal(f.requests.filter(r=>r.path==='/api/chat/stream').length,0);
        assert.deepEqual(f.errors,[]);
    } finally {await f.context.close();}
});
