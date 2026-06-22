var PD = this.parent.document;
window.onmousewheel = function (e) {
    PD.Wheel(e);
}
document.addEventListener("keydown", function (e) { PD.keydown(e); });
document.addEventListener('contextmenu', event => event.preventDefault());

[].forEach.call(document.body.querySelectorAll('[href]'), function (a) {
    a.onclick = function () { Href(a); event.stopPropagation(); return false; }
});

var selectionFlag = false;
document.body.onmouseup = function (e) {
    if (e.button == 0)//left click
    {
        let tryclose = PD.TryCloseFootnote() || PD.TryCloseContextMenu();
        if (tryclose) return;
        let sel = window.getSelection();
        if (sel.type == 'Range') {
            selectionFlag = true;
            return;
        }
        if (selectionFlag) {
            selectionFlag = false;
            return;
        }

        if (PD.menuOn || PD.navOn) {
            PD.MenuClose();
        } else {
            let top = window.frameElement.offsetTop + e.pageY;
            if (top < PD.defaultView.innerHeight * 0.2)
                PD.MenuOpen();
        }

    } else
        if (e.button == 2)//right
        {
            PD.ContextMenu(e.target, e.pageX, e.pageY, window.frameElement);
        }

};
var fontSizeStyle = document.createElement("style");
fontSizeStyle.innerHTML = "html{font-size:" + PD.userSettings.bookFontSize + "px}";
document.head.appendChild(fontSizeStyle);
var style = document.createElement("style");
style.innerHTML = PD.direction.injectStyle;
document.head.appendChild(style);
var themeStyle = document.createElement("style");
themeStyle.innerHTML = PD.theme.frameStyle;
document.head.appendChild(themeStyle);
FixImageOnlyPage();
document.addEventListener("touchstart", function (e) { PD.OnFrameTouchStart(e.touches[0].screenX, e.touches[0].screenY); });
document.addEventListener("touchend", function (e) { PD.OnFrameTouchEnd(); });
document.addEventListener("touchmove", function (e) { PD.OnFrameTouchMove(e.touches[0].screenX, e.touches[0].screenY); });
[].forEach.call(document.getElementsByTagName("img"), function (e) { e.src = e.src + "?" + PD.theme.name; });
[].forEach.call(document.getElementsByTagName("image"), function (e) { e.setAttribute("xlink:href", e.getAttribute("xlink:href") + "?" + PD.theme.name); });
function FixImageOnlyPage() {
    let images = document.body.querySelectorAll("img");
    let svgs = document.body.querySelectorAll("svg");
    let text = document.body.innerText || document.body.textContent || "";
    if (images.length != 1 || svgs.length != 0 || text.trim() != "") return;
    let style = document.createElement("style");
    style.innerHTML = "html,body{width:100vw!important;height:100vh!important;margin:0!important;padding:0!important;overflow:hidden!important;writing-mode:horizontal-tb!important;-webkit-writing-mode:horizontal-tb!important;} body,body *{box-sizing:border-box!important;max-width:none!important;max-height:none!important;} body{display:flex!important;align-items:center!important;justify-content:center!important;} body div,body p,body h1{display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;} body span:empty{display:none!important;} img,svg{width:100%!important;height:100%!important;max-width:100vw!important;max-height:100vh!important;object-fit:contain!important;}";
    document.head.appendChild(style);
}
function Href(e) {
    if (e.getAttribute("epub:type") == "noteref") {
        let noteid = e.href.split('#')[1];
        let note = document.getElementById(noteid);
        PD.PopupFootnote(note.innerHTML, e.offsetLeft, e.offsetTop, this.frameElement);
        return false;
    }
    PD.MenuClose();
    PD.Link(e.href);

}
document.body.oncopy = PD.FrameOnCopy;