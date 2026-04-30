async function run() {
  try { await fetch('http://::1'); } catch(e) { console.log(e.constructor.name, e.message); }
}
run();
