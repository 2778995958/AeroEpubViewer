function CopyImage(url) {
    AppCall("aeroepub://domain/app/CopyImage/" + url.substring("aeroepub://domain/book/".length));
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
function SetReadingMode(enabled) {
    enabled = !!enabled;
    document.readingMode = enabled;
    if (document.userSettings) document.userSettings.readingMode = enabled;
    let posUrl = (!paged && enabled && typeof ReadingSerializeCurrentAnchor == "function") ?
        "aeroepub://domain/app/readingpos/" + ReadingSerializeCurrentAnchor() :
        "aeroepub://domain/app/pos" + GetBookPos();
    let posReq = new XMLHttpRequest();
    posReq.open("GET", posUrl, false);
    posReq.send();
    let modeReq = new XMLHttpRequest();
    modeReq.open("GET", "aeroepub://domain/app/readingmode/" + (enabled ? "true" : "false"), false);
    modeReq.send();
    AppCall("aeroepub://domain/app/reload");
}
function Inspector() {
    AppCall("aeroepub://domain/app/inspector");
}
function ScreenTest() {
    let e = document.getElementById("screenTest");
    AppCall("aeroepub://domain/app/screentest/" + e.offsetWidth + "/" + e.offsetHeight);
}