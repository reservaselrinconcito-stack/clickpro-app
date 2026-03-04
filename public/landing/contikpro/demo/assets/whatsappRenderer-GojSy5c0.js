function p(r,a){const i=r.blocks||[],c=[];i.forEach(e=>{const t=e.content||"";switch(e.type){case"heading":c.push(`*${t.toUpperCase()}*`);break;case"text":t.trim()&&c.push(t);break;case"divider":c.push("──────────");break;case"button":const n=e.content||"Ver documento",o=e.href||"#";c.push(`[${n}]
👉 ${o}`);break}});let s=c.join(`

`);return Object.entries(a).forEach(([e,t])=>{let n=t;e==="doc_total"?n=t.replace(/<[^>]*>?/gm,""):e==="doc_fecha"?n=t.replace(/<[^>]*>?/gm,""):e==="doc_link"&&(n=`
${t.trim()}`);const o=new RegExp(`{{${e}}}`,"g");s=s.replace(o,n)}),s=s.replace(/{{[^{}]*}}/g,""),s.trim()}export{p as generateWhatsAppText};
//# sourceMappingURL=whatsappRenderer-GojSy5c0.js.map
