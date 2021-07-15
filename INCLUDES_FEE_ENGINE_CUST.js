//Custom Fee Engine Functions
function taskStatusHistoryCount(wfstr, wfstat) //optional capId
{
    var occurrences = 0;
    var itemCap = capId;
    wfstat = wfstat || "";
    wfstr = wfstr || "";
    if (arguments.length > 2) itemCap = arguments[2];

    tasksHistoryArray = aa.workflow.getHistory(itemCap).getOutput();
    for (var t in tasksHistoryArray) {
        var thisTask = tasksHistoryArray[t];
        if (wfstr.toUpperCase().equals(thisTask.getTaskDescription().toUpperCase()) && wfstat.toUpperCase().equals(thisTask.getDisposition().toUpperCase())) {
            occurrences++;
        }
    }
    return occurrences;
}

function convenienceFee(amount, percentage, upcharge) {
    var cPercent = 1;
    if (percentage < 1 && percentage > 0) {
        cPercent += percentage;
    } else if (percentage > 0) {
        cPercent += (percentage / 100);
    } else {
        return 0;
    }
    logDebug("percentage is " + cPercent);
    logDebug("amount is " + amount);

    var baseCFee = amount * cPercent;

    logDebug("cc fee is " + baseCFee);

    if (upcharge) {
        logDebug("updcharging");
        //This Code Agency Wants $100 CC wants $2 (2%) Agency Swipes $102.04 CC gets $2.04 Agency gets $100
        var swipeCFee = baseCFee * cPercent;
        var realCFee = parseFloat(swipeCFee - baseCFee);
        logDebug("with upcharge fee is " + realCFee);
        return realCFee;
    } else {
        //Basic Code Agency Wants $100 CC wants $2 (2%) Agency Swipes $102 CC gets $2.04 Agency gets $99.96
        return baseCFee-amount;
    }
}

function convFeeExists(feeList, convFeeCodes, query) {
    if (feeList) {
        var feeListArray = feeList.split("|");
        for (f in feeListArray) {
            var fee = feeListArray[f];
            if (exists(fee, convFeeCodes)) {
                return true;
            }
        }

    } else if (query) {
        var b = getFeeEngine_GetFeeHistoryFromString_Balance(query);
        if (b > 0) {
            return true;
        }
    }
    return false;
}


function appMatchArray(recordTypesArray) {
    for (var a in recordTypesArray) {
        var recTypeToMatch = recordTypesArray[a];
        if (appMatch(recTypeToMatch)) {
            return true;
        }
    }
    return false;
}

function isTaskStatusHistory(wfstr, wfstat) //optional capId
{
	var itemCap = capId;
	wfstat = wfstat || "";
	wfstr = wfstr || "";
	if (arguments.length > 2) itemCap = arguments[2];

	tasksHistoryArray = aa.workflow.getHistory(itemCap).getOutput();
	for (var t in tasksHistoryArray)
	{
		var thisTask = tasksHistoryArray[t];
		if (wfstr.toUpperCase().equals(thisTask.getTaskDescription().toUpperCase()) && wfstat.toUpperCase().equals(thisTask.getDisposition().toUpperCase()))
		{
			return true;
		}
	}
	return false;
}