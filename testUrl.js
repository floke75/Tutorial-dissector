try { new URL('http://::1'); } catch(e) { console.log(e.constructor.name, e.message); }
