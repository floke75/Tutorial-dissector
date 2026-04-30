try { new Headers({"x": "a\nb"}); } catch(e) { console.log(e.name, e.message); }
