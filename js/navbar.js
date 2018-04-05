function renderSimple(id) {
    var e = document.getElementById(id);
    var timestamp = new Date().toISOString();
    var name = e.id;
    e.innerHTML="<h2>" + name + "</h2> " + name + " was called at " + timestamp;
}

$().ready( function () {

    $("a[href='#home']").on("click", function(event) {
	var id = this.getAttribute("href", 2).replace("#","");
	renderSimple(id);
    });
    
    $("a[href='#about']").on("click", function(event) {
	var id = this.getAttribute("href", 2).replace("#","");
	renderSimple(id);
    });
    
    $("a[href='#contact']").on("click", function(event) {
	var id = this.getAttribute("href", 2).replace("#","");
	renderSimple(id);
    });
    
    $("a[href='#home']").click();

});
