function CopyImage(url) {
    let q = url.indexOf("?");
    if (q >= 0) url = url.substring(0, q);
    let mark = "/book/";
    let i = url.indexOf(mark);
    let path = i >= 0 ? url.substring(i + mark.length) : url;
    AppCall("aeroepub://domain/app/CopyImage/" + path);
    document.TryCloseContextMenu();
}
function InspectElement() {
    console.log(tempTargetElement);
    Inspector();
    document.TryCloseContextMenu();
}

function SetTheme() {
    let name = document.getElementById("themeSelect").value;
    gen_theme_warm(document.userSettings.warmColor);
    switch (name) { case "default": document.theme = theme_default; break; case "warm": document.theme = theme_warm; break; case "dark": document.theme = theme_dark; break; }
    for (let i = 0; i < frameList.length; i++) { frameList[i].contentWindow.location.reload(); }
    themeStyle.innerHTML = document.theme.viewerStyle;
    AppCall("aeroepub://domain/app/theme/" + name);
}

function ApplyFontSize(a) {
    document.userSettings.bookFontSize = parseInt(a);
    AppCall("aeroepub://domain/app/pos" + GetBookPos());
    AppCall("aeroepub://domain/app/bookfontsize/" + document.userSettings.bookFontSize);
}
function Inspector() {
    AppCall("aeroepub://domain/app/inspector");
}
function ScreenTest() {
    let e = document.getElementById("screenTest");
    AppCall("aeroepub://domain/app/screentest/" + e.offsetWidth + "/" + e.offsetHeight);
}