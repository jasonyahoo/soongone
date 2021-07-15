function getFeeEnginePenalties(recordFeeAmt){
    //Optional capId
    itemCap = capId;
    if (arguments.length == 2)
        itemCap = arguments[1];

    var penalty = {"amount":0,"note":""}
    var penalties = getPermitPenalties(itemCap);

    for(p in penalties){

        //penalty.amount += p.amount;
        var thisPen = penalties[p];
        var thisPencapId = thisPen.recordCap.getCapID();

        if (appMatch("DBI/Enforcement/Plumbing/NA", thisPencapId) || appMatch("DBI/Enforcement/Electrical/NA", thisPencapId))
        {
            penalty.amount += thisPen.amount * thisPen.pMultiplier;
        }
        //BID/DAD Penalty fees
        else if (appMatch("DBI/Enforcement/Building/NA", thisPencapId) || appMatch("DBI/Enforcement/Accessibility/NA", thisPencapId))
        {
            penalty.amount += getFeeEnginePenalties_Building(thisPen.valueOfWorkWithoutPermit) * thisPen.pMultiplier;
        }
        //PTO Penalty fees
        else if (appMatch("DBI/Enforcement/Plumbing/Boiler", thisPencapId))
        {
            penalty.amount += thisPen.amount * thisPen.pMultiplier;
            /* thisPen.pMultiplier = 9;
            thisPen.amount = 48.36;
            penalty.amount += thisPen.pMultiplier * thisPen.amount; */
        }
        if(penalty.note){
            penalty.note += "\n";
        }
        penalty.note += "Complaint #: " + thisPen.complaintNumber + " Multiplier: " + thisPen.pMultiplier + " X Amount: $ " + thisPen.amount;
    }

    return penalty;
}

function getFeeEnginePenalties_Building(jobValue){
    var penalty = 0;
    
    //Optional capId
    itemCap = capId;
    if (arguments.length == 2)
        itemCap = arguments[1];

    var _addendum = ['DBI/Permits/Building/Addendum - Alterations','DBI/Permits/Building/Addendum - NewCon'];
    var _alterations = ['DBI/Permits/Building/Alterations Site Permit','DBI/Permits/Building/Additions Alterations Repairs'];
    var _PBI = ['DBI/Permits/Building/Physical Building Inspection'];
    
    var _regularBuildingIgnore = _addendum;
    _regularBuildingIgnore = _regularBuildingIgnore.concat(_PBI);
    
    var _NoAltAndDefaultIgnore = _regularBuildingIgnore;
    _NoAltAndDefaultIgnore = _NoAltAndDefaultIgnore.concat(_alterations);

    var feeSchedule = "DBI_BUILDING";
    var feeCode = "";
    var paymentPeriod = "ISSUANCE";
    if(appMatchArray(_alterations,itemCap)){
        feeCode = "DBI BL-ALT-I";
    }
    else{
        feeCode = "DBI BLDG-I";
    }

    if(!isBlank(feeCode)){
        var version = penalty_getDefaultVersionByScheduleAndFeeCode(feeSchedule,feeCode, new Date());
        if (version == null || version == "") {
            logDebug("::feeEngine.getRefFee() no version for this fee schedule, so can't get a ref fee");
            return 0;
        }

        var assessFeeResult = aa.finance.createFeeItem(itemCap, feeSchedule, version, feeCode, paymentPeriod, jobValue);
		if (assessFeeResult.getSuccess()) {
            var tempFeeSeq = assessFeeResult.getOutput();
            if(tempFeeSeq){
                logDebug("PENALTIES: Successfully added TEMP Fee, sequence Number " + tempFeeSeq + " with fee code " + feeCode);
                var feeAmt = aa.finance.getFeeItemByPK(itemCap, tempFeeSeq).getOutput().getF4FeeItem().getFee();
                if(feeAmt){
                    logDebug("PENALTIES: Successfully added TEMP Fee, AMOUNT " + feeAmt);

                    var removed = aa.finance.removeFeeItem(itemCap, tempFeeSeq).getSuccess();
                    return feeAmt;
                }
                else{
                    return 0;
                }
            }  
        }
    }

    return 0;
}

function penalty_getDefaultVersionByScheduleAndFeeCode(feeSchedule,feeCode, vDate) {

    /*
    Alternative to com.accela.aa.finance.fee.RefFeeBusiness.getDefaultVersionBySchedule
    which also looks for a fee code within the fee schedule.   This is necessary for CCSF
    since there are multiple fee schedule versions within a date range.
     */

    logDebug("::feeEngine.getDefaultVersionByScheduleAndFeeCode() starting with vDate of " + vDate);
    var resultArray = [];
    var array = [];
    var spc = aa.getServiceProviderCode();

    var array = [];

    var effDateString = (vDate.getMonth() + 1) + "/" + vDate.getDate() + "/" + vDate.getFullYear();

    var sql = "SELECT fee_schedule_version " +
        " FROM   rfee_schedule rfee " +
        " WHERE  rfee.serv_prov_code = '" + aa.getServiceProviderCode() + "' " +
        " AND rfee.fee_schedule_name = '" + feeSchedule + "' " +
        " AND eff_date <= To_date('" + effDateString + "', 'MM/DD/YYYY') " +
        " AND rec_status = 'A' " +
        " AND ( exp_date IS NULL OR exp_date > To_date('" + effDateString + "', 'MM/DD/YYYY')) " +
        " AND fee_schedule_version IN(SELECT fee_schedule_version FROM rfeeitem WHERE " +
        " rfeeitem.serv_prov_code = '" + aa.getServiceProviderCode() + "' " +
        " AND rfeeitem.r1_fee_code = '" + feeSchedule + "' " +
        " AND rfeeitem.r1_gf_cod = '" + feeCode + "' " +
        " AND rfeeitem.rec_status = 'A' ) " +
        " ORDER BY EFF_DATE DESC ";

    try {
        //logDebug("::feeEngine sql = " + sql);
        var array = [];
        var initialContext = aa.proxyInvoker.newInstance("javax.naming.InitialContext", null).getOutput();
        var ds = initialContext.lookup("java:/AA");
        var conn = ds.getConnection();
        var sStmt = conn.prepareStatement(sql);

        if (sql.toUpperCase().indexOf("SELECT") == 0) {
            var rSet = sStmt.executeQuery();
            while (rSet.next()) {
                var obj = {};
                var md = rSet.getMetaData();
                var columns = md.getColumnCount();
                for (i = 1; i <= columns; i++) {
                    obj[md.getColumnName(i)] = String(rSet.getString(md.getColumnName(i)));
                }
                obj.count = rSet.getRow();
                array.push(obj)
            }
            rSet.close();
        } else {
            aa.print("executing : " + sql);
            sStmt.execute();
        }

        if (array[0]) {
            logDebug("::feeEnginegetDefaultVersionByScheduleAndFeeCode() returning version : " + array[0].FEE_SCHEDULE_VERSION);
            return array[0].FEE_SCHEDULE_VERSION;
        } else {
            logDebug("::feeEnginegetDefaultVersionByScheduleAndFeeCode() did not find a matching fee version.");

            return false;
        }
    } catch (err) {
        aa.print(err.message);
    }
    finally {
        if (rSet) { rSet.close(); }
        if (sStmt) { sStmt.close(); }
        if (conn) { conn.close(); }
        if (initialContext) { initialContext.close(); }
    }

}