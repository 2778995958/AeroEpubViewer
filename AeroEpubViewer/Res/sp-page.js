var PD = this.parent.document;
document.addEventListener('contextmenu', event => event.preventDefault());
function OnSpWheel(e) {
    if (e.stopPropagation) e.stopPropagation();
}
document.addEventListener("wheel", OnSpWheel, { passive: true });
document.addEventListener("mousewheel", OnSpWheel, { passive: true });
var themeStyle = document.createElement("style");
themeStyle.innerHTML = PD.theme.frameStyle;
document.head.appendChild(themeStyle);
document.body.onmouseup = function (e) {
    if (e.button == 0)//left click
    {
    } else
        if (e.button == 2)//right
        {
            console.log(e.target.tagName)
            let img = e.target;
            while (img && img.tagName && img.tagName.toUpperCase() != "IMG") img = img.parentElement;
            if (img && img.tagName && img.tagName.toUpperCase() == "IMG") {
                ContextMenu(img, e.pageX, e.pageY, window.frameElement);
            }
        }

};

var contextMenu = document.getElementById("context_menu");
var contextMenuOn = false;
var ContextMenu = function (e, left, top, frame) {
    contextMenuOn = true;
    left = frame.offsetLeft + left;
    top = frame.offsetTop + top;
    contextMenu.style.left = left + "px";
    contextMenu.style.top = top + "px";
    contextMenu.style.display = "block";
    if (e.tagName.toUpperCase() == "IMG") {
        contextMenu.innerHTML = "<div onclick=\"CopyImage('" + e.src + "')\">复制图片</div>"
    }
}
var TryCloseContextMenu = function () {
    if (contextMenuOn) {
        contextMenu.style.display = "none";
        contextMenuOn = false;
        return true;
    }
    return false;
}
function CopyImage(url) {
    let q = url.indexOf("?");
    if (q >= 0) url = url.substring(0, q);
    let mark = "/book/";
    let i = url.indexOf(mark);
    let path = i >= 0 ? url.substring(i + mark.length) : url;
    AppCall("aeroepub://domain/app/CopyImage/" + path);
    TryCloseContextMenu();
}
function AppCall(url) {
    let xhttp = null
    xhttp = new XMLHttpRequest();
    xhttp.open("GET", url, true);
    xhttp.send();
}