var lastEta = {
    'UP': [],
    'DOWN': []
}

function fTime(t) {
    return strftime('%H:%M:%S.%L', t);
}

// function getSelectedCode(a) {
//     return $(`[data-select="${a}"] option:selected`).val();
// }

// function enableStationSelector() {
//     var selectedLineCode = getSelectedCode('line');
//     $('[data-select="station"]').empty().append('<option selected="selected" disabled="disabled">Select station</option>')
//     for (const line of lines) {
//         if (line.code == selectedLineCode) {
//             for (const station of line.stations) {
//                 $('[data-select="station"]').append(`<option value="${station.code}">${station.name}</option>`);
//             }
//         }
//     }
//     $('[data-select="station"]').attr("disabled", false);
// }

function getStationNameByCode(code) {
    for (const line of lines) {
        for (const station of line.stations) {
            if (station.code == code) return station.name
        }
    }
    return 'Unknown Station'
}

// for (const line of lines) {
//     $('[data-select="line"]').append(`<option value="${line.code}">${line.name}</option>`);
// }
// enableStationSelector();
// $('[data-select="line"]').change(() => {
//     enableStationSelector();
// })

class Eta {
    constructor(data) {
        this.source = data.source;
        this.sequence = data.seq;
        this.destination = getStationNameByCode(data.dest); // 
        this.valid = data.valid == 'Y'; //
        this.platform = data.plat; // 
        this.minLeft = parseInt(data.ttnt);
    }
}

class Stop {
    constructor(lineCode, stationCode) {
        for (const l of lines) {
            if (l.code == lineCode) {
                this.line = l;
                for (const s of l.stations) {
                    if (s.code == stationCode) {
                        this.station = s;
                    }
                }
                this.UP = l.UP;
                this.DOWN = l.DOWN;
                break;
            }
        }
        this.lang = 'EN';
    }

    async getEta() {
        fetch(`https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${this.line.code}&sta=${this.station.code}&lang=${this.lang}`)
        .then((response) => {
            if (response.ok) return response.json();
            throw new Error('Network error');
        })
        .then((json) => {
            const data = json.data[Object.keys(json.data)[0]];
            if (json.message != "successful") throw new Error(`Server Error: ${json.message}`);
            if ((data.UP == undefined || !data.UP.length) && (data.DOWN == undefined || !data.DOWN.length)) throw new Error("No data."); // if both UP and DOWN is undefined or is an empty array, throw error.
            return data;
        })
        .then((data) => {
            // updated every ~5 seconds
            this.sysTime = new Date(data.sys_time).getTime()

            //debug
            let sys = new Date(data.sys_time);
            let curr = new Date(data.curr_time);
            $('[data-time="sys"]').html(fTime(sys));
            $('[data-time="curr"]').html(fTime(curr));


            if (data.UP == undefined || !data.UP.length) {
                $('[data-section="UP"]').addClass("hidden");
            } else {
                this.displayData(data.UP, "UP");
                $('[data-section="UP"]').removeClass("hidden");
            }

            if (data.DOWN == undefined || !data.DOWN.length) {
                $('[data-section="DOWN"]').addClass("hidden");
            } else {
                this.displayData(data.DOWN, "DOWN");
                $('[data-section="DOWN"]').removeClass("hidden");
            }

            // console.log(lastEta)
            $('#progressbar').css('opacity', '100%').animate({
                opacity: 0
            }, 250);
        })
        .catch((error) => {
            console.error(error); 
        });
    }

    displayData(data, dir) {
        $(`[data-dir="${dir}"][data-field="destination"]`).html(this[dir].map(a => a.name).join(' / '));
        let i = 0;
        let tableHTML = '';
        for (const e of data) {
            const eta = new Eta(e);
            const thisLastEta = lastEta[dir][i] == undefined ? null : lastEta[dir][i];
            let rowColor, displayTime, message;

            if (!eta.valid) {
                rowColor = 'table-danger';
                displayTime = 'N/A';
                message = 'Invalid time';
            } else if (thisLastEta == null) {
                lastEta[dir][i] = {
                    'minLeft': eta.minLeft,
                    'time': null,
                    'messageLog': '',
                }
                rowColor = 'table-secondary';
                displayTime = `<${eta.minLeft} min`;
                message = 'Waiting...';
            } else {
                if (eta.minLeft < thisLastEta.minLeft) {
                    lastEta[dir][i].minLeft = eta.minLeft;
                    lastEta[dir][i].time = this.sysTime;
                    lastEta[dir][i].messageLog += `${lastEta[dir][i].minLeft} min @ ${fTime(new Date(lastEta[dir][i].time))}<br>`;
                } else if (eta.minLeft > thisLastEta.minLeft) {
                    lastEta[dir][i] = {
                        'minLeft': eta.minLeft,
                        'time': null,
                        'messageLog': '',
                    }
                }
                if (lastEta[dir][i].time == null) {
                    rowColor = 'table-secondary';
                    displayTime = `<${eta.minLeft} min`;
                    message = 'Waiting...';
                } else {
                    rowColor = 'table-success';
                    displayTime = `<${eta.minLeft} min`;
                    message = lastEta[dir][i].messageLog;

                    // const accurateEtaSeconds = ((lastEta[dir][i].time + lastEta[dir][i].minLeft * 60000) - this.sysTime) / 1000;
                    // if (accurateEtaSeconds < 0) {
                    //     lastEta[dir].shift();
                    //     rowColor = 'table-secondary';
                    //     displayTime = `~${eta.minLeft} min`
                    //     message = 'Waiting for ETA change...';
                    // } else {
                    //     rowColor = 'table-success';
                    //     displayTime = `${Math.floor(accurateEtaSeconds / 60)} min ${accurateEtaSeconds % 60} sec / ${eta.minLeft} min`
                    //     message = `Last ETA change: ${fTime(thisLastEta.changedTime)}`;
                    // }
                }
            }

            tableHTML += `
            <tr class="${rowColor}">
                <td>${eta.destination}</td>
                <td>${eta.platform}</td>
                <td>${displayTime}</td>
                <td>${message}</td>
            </tr>
            `
            $(`[data-dir="${dir}"][data-field="table-data"]`).html(tableHTML);
            i++;
        }
    }
}

const interval = 2000;
setInterval(() => {
    let stop = new Stop('TML', 'WKS')
    stop.getEta();
}, interval);

//timer
setInterval(() => {
    $('[data-time="comp"]').html(fTime(new Date()));
}, 50);