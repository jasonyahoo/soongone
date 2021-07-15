try {
    eval(getScriptText("INCLUDES_FEE_ENGINE_CORE"));
    var fees = null;

    //if (capId.getID1().indexOf("HIS") == -1) {
    logDebug('loading fees');

    //logic to decide which schedules to load
    var schedules = findSchedulesByRecordType();

    logDebug('schedules are ' + schedules);

    if (schedules) {
        fees = new feeEngine({
            "loadList": schedules
        });
    } else {
        fees = new feeEngine();
    }

    if (fees.fees && fees.fees.length) {
        logDebug('fees loaded');
        fees.assessFees();
    } else {
        logDebug('!!!! oops no fees?');
    }
    //}
} catch (err) {
    handleError(err, "APPLYFEES");
}