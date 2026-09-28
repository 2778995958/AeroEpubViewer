var measure_container = document.getElementById("measure_container");
var measure_firstInit = false;
var measure_d;
var measure_count = 2;
var measure_pos = new Array(measure_count);
function ChromeLength() {
    return direction.GetChromeLength ? direction.GetChromeLength() : direction.GetWindowLength();
}
function SetMeasurePos(el, px) {
    if (direction.SetChromePos) direction.SetChromePos(el, px);
    else direction.SetParallelPositivePos(el, px);
}
function InitMeasure() {
    measure_d = ChromeLength() * 0.8;
    let start = ChromeLength() * 0.1;
    measure_pos[0] = start;
    measure_pos[1] = start + measure_d;
    SetMeasurePos(measure_container.children[0], measure_pos[0]);
    SetMeasurePos(measure_container.children[1], measure_pos[1]);
}
function MeasureScroll(px) {
    for (let i = 0; i < measure_count; i++) {
        measure_pos[i] = measure_pos[i] + px;
        if (measure_pos[i] < -20) { measure_pos[i] += measure_count * measure_d; }
        else if (measure_pos[i] > ChromeLength() + 20) {
            measure_pos[i] -= measure_count * measure_d;
        }
    }
    SetMeasurePos(measure_container.children[0], measure_pos[0]);
    SetMeasurePos(measure_container.children[1], measure_pos[1]);
}