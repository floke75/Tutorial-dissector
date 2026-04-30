try { atob('invalid^^^'); } catch(e) { console.log(e.constructor.name, e.message); }
