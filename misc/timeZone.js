const tZ = require('timezone-support')

const weekDays = {  0:"Sunday",
                    1:"Monday", 
                    2:"Tuesday", 
                    3:"Wednesday", 
                    4:"Thursday", 
                    5:"Friday", 
                    6:"Saturday"}

const months = {
    1:"Jan",
    2:"Feb",
    3:"Mar",
    4:"Apr",
    5:"May",
    6:"Jun",
    7:"Jul",
    8:"Aug",
    9:"Sep",
    10:"Oct",
    11:"Nov",
    12:"Dec"
}
/**
 * Validates that time string has form xxam, xam, xpm xxpm (x in 0,..,9)
 * @param {string} timeString input string
 * @return true if validator succeeds
 */
function validateTime(timeString)
{
    // check length
    var l = timeString.length;
    if(l != 3 && l != 4)
        return undefined;

    // check hour
    var hour = -1;
    var ampm ="";
    if (l == 3)
    {
        hour = parseInt(timeString[0], 10)
        ampm = timeString.substring(1,3);
    } else {
        hour = parseInt(timeString.substring(0, 2))
        ampm = timeString.substring(2,4);
    }
    if((hour == NaN || hour < 0 || hour > 12) || (ampm != "am" && ampm != "pm"))
        return undefined;

    if(ampm != "pm" || hour == 12)
        timeString = hour;
    else 
        timeString = hour+12;
    
    return timeString;
}

/**
 * gets time zone from time zone name
 * @param {*} timezoneName 
 */
async function findTimeZone(timezoneName)
{

    /*
    * POSIX-Definition causes GMT+X to be GMT-X and vice versa... 
    * In order to not confuse the user we exchange + and - here ;-)
    */
    if(timezoneName.startsWith("GMT")) 
    {
        if(timezoneName.length>3)
        {
            var sign = timezoneName[3];
            if(sign == "+")
                timezoneName = "Etc/GMT-" + timezoneName.substr(4);
            else if(sign == "-")
                timezoneName = "Etc/GMT+" + timezoneName.substr(4);
        } else {
            timezoneName = "Etc/" + timezoneName;
        }
    }
    
    var res = true;
    var error = "";
    try {
        var zone = await tZ.findTimeZone(timezoneName);
    } catch(err) {
        res = false;
        error = err.message;
    };
    if(!res)
        return [undefined, error];

    return [zone, ""];
}

module.exports = {
    weekDays: weekDays,
    months:months,
    
    createLobbyTime: async function(time, timezoneName, tomorrow) {
        // get time
        var _time = validateTime(time);
        if(_time == undefined)
        {
            return [false, undefined, timezoneName, "you need to provide a valid full hour time (e.g. 9pm, 6am, ...) in your post"];
        }

        // get time zone
        [zone, error] = findTimeZone(timezoneName)
        if(zone == undefined)
            return [false, undefined, timezoneName, error];

        // get 'now'
        var date = new Date();

        // get offset to user's time zone
        var tZoffset = tZ.getUTCOffset(date, zone);
        
        // get utc hour of user's time
        var utcHour = _time + tZoffset.offset/60

        // create date at wanted UTC time
        var lobbyDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() + (tomorrow ? 1 : 0), utcHour, 0, 0, 0));

        // check if 'wanted UTC time' has already past 'now'
        if(date >= lobbyDate)
            return [false, undefined, timezoneName, "Time is in the past (or tomorrow...). If you want to set up a lobby for tomorrow - do it tomorrow :-)"]
        
        // return zoned time
	    var zonedTime = await tZ.getZonedTime(lobbyDate, zone);
        return [true, zonedTime, timezoneName, ""];
    },

    getUserLobbyTime: async function(date, timezoneName) {
        
        var error =""
        try {
            // find user zone
            [userzone, error] = await findTimeZone(timezoneName)
            if(userzone == undefined)
                return;

            // calculate zoned time 
            var zonedtime = await tZ.getZonedTime(date, userzone)
        } catch(err) {
            error = err.message;
        };
        if(error == "")
            return [true, weekDays[zonedtime.dayOfWeek] + ", " + zonedtime.hours + ":00 " + timezoneName]

        return [false, error]
    },

    getZonedTime: async function(date, timezone) {
        return await tZ.getZonedTime(date, timezone)
    }

}