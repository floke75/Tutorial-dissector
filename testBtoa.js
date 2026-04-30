try { btoa('hello\u0100'); } catch(e) { console.log(e.constructor.name, e.message); }
