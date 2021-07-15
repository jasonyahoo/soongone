function getFeeEngineConfig(_currentTiming, _itemCap, _TSI) {
	feeitemCap = _itemCap;
	currentTiming = _currentTiming;
	TSI = _TSI;
	feeScheduleLoadList = null;

	var config = null;

	if (arguments.length == 4) {
		feeScheduleLoadList = arguments[3];

		config = getFeeEngineSchedules(feeScheduleLoadList);
	} else {
		config = getFeeEngineSchedules();
	}

	return config;
}

function getFeeEngineBalanceConfig() {
	/*JSON_EXAMPLE:
		{
    "Building/Commercial/New/NA": { //appTypeString
        "WorkflowTaskUpdateBefore": [{ //controlString
            "metadata": {
                "description": "the default for Commercial Building records.",
                "operators": {
                    
                }
            },
            "criteria": {
                "workflow" : {
                    "Issuance" : "Issued"
				},
				"balance": "_TEN",
				"period": "FINAL"
            },
            "action": {
                "cancel": true
            }
        }]
    }...
	*/
	/*EXPLANATION
	  configuration for this function is kept in the file called CONFIGURABLE_FEE_ENGINE_BALANCE.json
	  function preforms balance checks for the configured record based on the rules
	  
	  appTypeString: First property of the json it designates the record type for which the
					 configuration is for. "*" cna be used between the "/" as a wildcard
					 only the most specific qualifying appTypeString configuration will be used
					 i.e. if you are passing the record type of Building/Commercial/New/NA and both
					 Building/Commercial/New/* and Building/Commercial/New/NA are in the configuration file
					 Building/Commercial/New/NA will be used
	  controlString: Event in which the configuration will be applied
	  
	  description: notes on the configuration
	  operators: an object that can contain alternate operators like !=, >, >=, ||, <, and <=
				 to be used in the the criteria section i.e. "workflow":{"||"} to use or in
				 in the workflow section.
	  
	  criteria: using == and && as primary operators if a match occurs the criteria i s true and 
	            the action is preformed. if criteria is empty the criteria is considered true
	    workflow - object containing properties of wfTask with a value of the wfStatus
				   Step : Status, in the status can also be "_ACTIVE" which is a boolean 
				   check to see if that is the active task or "_COMPLETE" which is a boolean
				   check to see if that task has been completed
		customField - object containing properties of labels and values of the value of
				  the ASI field, these are taken from AInfo
		customList - object containing objects named for tables with properties of columns and 
					 values of the column values, as soon as a value is found in the table it
					 this would be considered true
		balance: required designates what part of the total period balance must be paid at time the 
		         configuration is applied
				 options- "_TEN" for 10% paid
						  "_QUARTER" for 25% paid
						  "_HALF" for 50% paid
						  "_THREE_QUARTER" for 75% paid
						  "_FULL" for 100% paid
		period: required designates the payment period the fees checked for total period balance will have
	  
	  action: will set do what is configured in the options
	    workflow - object containing properties of wfTask with a value of the wfStatus
				   Step : Status, that will be set when taken "_ACTIVE" will set te given task active
		customField - object with custom field labels and values to be applied
		appStatus - is a property that the application status will be set to
		cancel - if set to true the event is canceled
	*/
}

function getFeeEngineSchedules() {
	var schedules = [];
	var load = false;

	var rSet = null;
	var conn = null;
	var initialContext = null;
	var sStmt = null;

	if (arguments.length == 1) {
		load = arguments[0];
	}

	var sql = "SELECT script_text " +
		" FROM   revt_agency_script rscript " +
		" WHERE  rscript.serv_prov_code = '" + aa.getServiceProviderCode() + "' " +
		" AND rec_status = 'A'";
	if (load) {
		load = load.split(',');
		for (var s in load) {
			load[s] = 'CONF_FEE_ENGINE_' + load[s];
		}
		load = "'" + load.join("','") + "'";
		sql += " AND rscript.script_code in (" + load + ")";
	} else {
		sql += " AND rscript.script_code like 'CONF_FEE_ENGINE_%'";
	}

	try {
		//logDebug("::feeEngine sql = " + sql);
		initialContext = aa.proxyInvoker.newInstance("javax.naming.InitialContext", null).getOutput();
		var ds = initialContext.lookup("java:/AA");
		conn = ds.getConnection();
		sStmt = conn.prepareStatement(sql);

		if (sql.toUpperCase().indexOf("SELECT") == 0) {
			var result = [];
			rSet = sStmt.executeQuery();
			while (rSet.next()) {
				var schedule = false;
				var iSchedule = false;
				var md = rSet.getMetaData();
				var columns = md.getColumnCount();
				for (var i = 1; i <= columns; i++) {
					iSchedule = String(rSet.getString(md.getColumnName(i)));
				}
				if (iSchedule) {
					schedule = eval(iSchedule);
				}
				if (schedule) {
					for (var f = 0; f < schedule.length; f++) {
						schedules.push(schedule[f]);
					}
				}
			}
			rSet.close();

		} else {
			logDebug("executing : " + sql);
			sStmt.execute();
		}

		return schedules;

	} catch (e) {
		logDebug(e.message);
	} finally {
		if (rSet) {
			rSet.close();
		}
		if (sStmt) {
			sStmt.close();
		}
		if (conn) {
			conn.close();
		}
		if (initialContext) {
			initialContext.close();
		}
	}

}

function findSchedulesByRecordType() {
	var ScheduleSet = aa.bizDomain.getBizDomain('FeeEngineSchedulesByRecord').getOutput();

	for (var rt = 0; rt < ScheduleSet.size(); rt++) {
		var isMatch = true;
		var matchArray = ScheduleSet.get(rt).getBizdomainValue().split('/');

		for (var xx in matchArray) {
			if (!appTypeArray[xx].equals(matchArray[xx]) && !matchArray[xx].equals("*")) {
				isMatch = false;
			}
		}

		if (isMatch) {
			return "" + ScheduleSet.get(rt).getDescription();
		}
	}

	return false;
}

function getFeeEngine_OverrideCapId() {
	//PURPOSE: If their are any record types that you always override with another related cap type before charging fees list them in the addendaOverride array remember to add rules below current setup is for swapping to the parent.

	var _itemCap = capId;

	var addendaOverride = [];
	if (appMatchArray(addendaOverride)) {
		var parent = getParent(capId);
		if (parent) {
			_itemCap = parent;
		}
	}

	return _itemCap;
}

function getFeeEngine_ASITQuantity(tableName, columnName, columnValue, quantityColumn) {
	var _columnValue;
	if (columnValue) {
		_columnValue = [columnValue];
	}

	var _tableName;
	if (tableName) {
		_tableName = [tableName];
	}

	return getFeeEngine_ASITQuantity_List(_tableName, columnName, _columnValue, quantityColumn);
}

function getFeeEngine_ASITQuantity_List(tableNames, columnName, columnValue, quantityColumn) {
	var itemCap = capId;
	if (arguments.length == 5)
		itemCap = arguments[4];

	var quantity = 0;

	for (t in tableNames) {
		var table = tableNames[t];
		logDebug("table: " + table);
		var tbl = loadASITable(table, itemCap) || [];
		if (tbl.length > 0) {
			logDebug("tbl.length: " + tbl.length);
			for (row in tbl) {

				var matchFound = false;
				if (!columnName && !columnValue) {
					matchFound = true;
				} else if (columnName && columnValue && exists(tbl[row][columnName].fieldValue, columnValue)) {
					matchFound = true;
				}

				if (matchFound) {
					var rowQuantity = 1; //Default to 1 per existence if no quantityColumn
					if (quantityColumn) {
						rowQuantity = tbl[row][quantityColumn].fieldValue;
					}
					quantity += rowQuantity;
				}
			}
			break;
		}
	}
	return quantity;
}

function getFeeEngine_ASITableFormulaSumRows(o) {
	var sum = 0;

	try {
		if (o) {
			for (var i in o) {
				if (o[i].table && o[i].formula && o[i].operation && o[i].capId) {
					var thisTable = loadASITable(o[i].table, o[i].capId);

					if (thisTable) {
						for (var r = 0; r < thisTable.length; r++) {
							var row = thisTable[r];
							var rowVal = 0;
							if (eval(o[i].operation)) {
								rowVal = parseFloat(eval(o[i].formula));
								rowVal = rowVal == "NaN" ? 0 : rowVal;
								sum += rowVal;
							}
						}
					} else {
						logDebug("Table (" + o[i].table + ") you passed is empty or could not be found.");
					}
				} else {
					logDebug("Object you passed did not have required properties table:" + o[i].table + ", formula:" + o[i].formula + ", capId:" + o[i].capId + ", and operation:" + o[i].operation + " required.");
				}
			}
		}
	} catch (e) {
		logDebug(e);
		return false;
	}

	return sum;
}

function getFeeEngine_JobValueHistory(_JobValue, _query) {
	var _capId = capId;
	if (typeof (itemCap) != "undefined") {
		_capId = itemCap;
	}

	if (arguments.length > 2) {
		_capId = arguments[2];
	}

	var ret = _JobValue;
	var h = getFeeEngine_GetFeeHistoryFromString_Quantity(_query, capId);
	if (h) {
		ret = _JobValue - h;
	}
	if (ret < 0) {
		ret = 0;
	}
	return ret;
}

function getFeeEngine_GetFeeHistoryFromString_Amount(_query) {
	var _capId = capId;
	if (typeof (itemCap) != "undefined") {
		_capId = itemCap;
	}

	if (arguments.length > 1) {
		_capId = arguments[1];
	}
	return getFeeEngine_GetFeeHistoryFromString(_query, _capId).SumAmount;
}

function getFeeEngine_GetFeeHistoryFromString_Quantity(_query) {
	var _capId = capId;
	if (typeof (itemCap) != "undefined") {
		_capId = itemCap;
	}

	if (arguments.length > 1) {
		_capId = arguments[1];
	}
	return getFeeEngine_GetFeeHistoryFromString(_query, _capId).Quantity;
}

function getFeeEngine_GetFeeHistoryFromString_Balance(_query) {
	var _capId = capId;
	if (typeof (itemCap) != "undefined") {
		_capId = itemCap;
	}

	if (arguments.length > 1) {
		_capId = arguments[1];
	}
	return getFeeEngine_GetFeeHistoryFromString(_query, _capId).Balance;
}

function getFeeEngine_GetFeeHistoryFromString(_query) {
	var _capId = capId;
	if (typeof (itemCap) != "undefined") {
		_capId = itemCap;
	}

	if (arguments.length > 1) {
		_capId = arguments[1];
	}

	var feeSchedules = new Array();
	var feeCodes = new Array();
	var paymentPeriods = new Array();
	var feeStatuses = new Array();
	var excludedFeeCodes = new Array();
	var subGroups = new Array();
	_query = String(_query);

	if (_query) {
		var s = _query.split("|", 6);
		if (s && s.length <= 6) {
			var a = s[0];
			var b = s[1];
			var c = s[2];
			var d = s[3];
			var e = "";
			if (s.length >= 5) {
				e = s[4];
			}

			var f = "";
			if (s.length >= 6) {
				f = s[5];
			}

			if (a) {
				var sa = a.split(",");
				if (sa) {
					for (_sa in sa) {
						feeSchedules.push(sa[_sa]);
					}
				}
			}

			if (b) {
				var sb = b.split(",");
				if (sb) {
					for (_sb in sb) {
						feeCodes.push(sb[_sb]);
					}
				}
			}

			if (c) {
				var sc = c.split(",");
				if (sc) {
					for (_sc in sc) {
						paymentPeriods.push(sc[_sc]);
					}
				}
			}

			if (d) {
				var sd = d.split(",");
				if (sd) {
					for (_sd in sd) {
						feeStatuses.push(sd[_sd]);
					}
				}
			}

			if (e) {
				var sx = e.split(",");
				if (sx) {
					for (_sx in sx) {
						excludedFeeCodes.push(sx[_sx]);
					}
				}
			}

			if (f) {
				var sf = f.split(",");
				if (sf) {
					for (_sf in sf) {
						subGroups.push(sf[_sf]);
					}
				}
			}
		}
	}

	var q = [{
		"feeSchedules": feeSchedules,
		"feeCodes": feeCodes,
		"paymentPeriods": paymentPeriods,
		"feeStatuses": feeStatuses,
		"excludedFeeCodes": excludedFeeCodes,
		"subGroups": subGroups
	}];

	var h = getFeeEngine_GetFeeHistory(q, _capId);
	_FeeQueryHistory[_query] = h;

	return h;
}

function getFeeEngine_GetFeeHistory_Amount(_query) {
	var _capId = capId;
	if (typeof (itemCap) != "undefined") {
		_capId = itemCap;
	}

	if (arguments.length > 1) {
		_capId = arguments[1];
	}
	return getFeeEngine_GetFeeHistory(_query, _capId).SumAmount;
}

function getFeeEngine_GetFeeHistory_Quantity(_query) {
	var _capId = capId;
	if (typeof (itemCap) != "undefined") {
		_capId = itemCap;
	}

	if (arguments.length > 1) {
		_capId = arguments[1];
	}
	return getFeeEngine_GetFeeHistory(_query, _capId).Quantity;
}

function getFeeEngine_GetFeeHistory_Balance(_query) {
	var _capId = capId;
	if (typeof (itemCap) != "undefined") {
		_capId = itemCap;
	}

	if (arguments.length > 1) {
		_capId = arguments[1];
	}
	return getFeeEngine_GetFeeHistory(_query, _capId).Balance;
}

function getFeeEngine_GetFeeHistory(_query) {
	/*Sample
	[
		{
			"feeSchedules": ['DBI_Building'],
			"feeCodes": ['DBI ADMIN-P','DBI ADMIN-I'],
			"paymentPeriods": ['FILING','ISSUANCE'],
			"feeStatuses": ['NEW','INVOICED'],
			"excludedFeeCodes": ['DBI ADMIN-P3',''DBI ADMIN-P4'],
			"subGroups": ['TECH-I','TECH-P']
		}
		,{
			"feeSchedules": ['DBI_Building2'],
			"feeCodes": ['DBI ADMIN-P2','DBI ADMIN-I2'],
			"paymentPeriods": ['FILING','ISSUANCE'],
			"feeStatuses": ['NEW','INVOICED'],
			"excludedFeeCodes": ['DBI ADMIN-P3',''DBI ADMIN-P4'],
			"subGroups": ['TECH-I','TECH-P']
		}
	]
	*/


	var _capId = capId;
	if (typeof (itemCap) != "undefined") {
		_capId = itemCap;
	}

	if (arguments.length > 1) {
		_capId = arguments[1];
	}

	//if (!_feesLoaded){
	var _feesArr = loadFees_ByQuery(_query, _capId);
	_feesLoaded = true;
	//}

	var sumAmount = 0,
		quantity = 0,
		balance = 0,
		paid = 0,
		retFeesArr = new Array();

	for (fIdx in _feesArr) {
		var fObj = _feesArr[fIdx];

		sumAmount += parseFloat(parseFloat(fObj.amount).toFixed(2));
		quantity += fObj.unit;
		balance += parseFloat(parseFloat(parseFloat(fObj.amount).toFixed(2) - fObj.amountPaid.toFixed(2)));
		paid += parseFloat(parseFloat(fObj.amountPaid).toFixed(2));
		retFeesArr.push(fObj);
	}

	return {
		"SumAmount": sumAmount,
		"Quantity": quantity,
		"Balance": balance,
		"Paid": paid,
		"FeeArray": retFeesArr
	};
}

function loadFees_ByQuery(_query) {
	var itemCap = capId;
	if (arguments.length > 1)
		itemCap = arguments[1]; // use cap ID specified in args

	return loadFees_ByQuery_capList(_query, [itemCap]);
}

function loadFees_ByQuery_capList(_query, lstCapIds) {
	var _q = "SELECT F.SERV_PROV_CODE, F.B1_PER_ID1, F.B1_PER_ID2, F.B1_PER_ID3, F.FEEITEM_SEQ_NBR, F.GF_FEE_PERIOD, F.GF_COD, F.GF_DISPLAY, F.GF_DES, F.GF_L1, F.GF_L2, F.GF_L3, F.GF_FORMULA, F.GF_UNIT, F.GF_UDES, F.GF_FEE, F.GF_CAL_PROC, F.GF_FEE_APPLY_DATE, F.GF_FEE_EFFECT_DATE, F.GF_FEE_EXPIRE_DATE, F.F4FEEITEM_UDF1, F.F4FEEITEM_UDF2, F.F4FEEITEM_UDF3, F.F4FEEITEM_UDF4, F.GF_SUB_GROUP, F.GF_FEE_CALC_FLAG, F.GF_ITEM_STATUS_FLAG, F.GF_FEE_SCHEDULE, F.FEE_SCHEDULE_VERSION ,COALESCE(( SELECT SUM(P.FEE_ALLOCATION) FROM X4PAYMENT_FEEITEM P WHERE P.SERV_PROV_CODE=F.serv_prov_code AND P.B1_PER_ID1=F.b1_per_id1 AND P.B1_PER_ID2=F.b1_per_id2 AND P.B1_PER_ID3=F.b1_per_id3 AND P.FEEITEM_SEQ_NBR=F.FEEITEM_SEQ_NBR AND P.PAYMENT_FEEITEM_STATUS is NULL ),0) GF_PAYMENT_AMOUNT FROM F4FEEITEM F WHERE F.SERV_PROV_CODE = '?ServProvCode' AND ((1=2) ?capIds) AND F.GF_FEE_SCHEDULE IN (?GF_FEE_SCHEDULE) AND F.GF_FEE_PERIOD IN (?GF_FEE_PERIOD) AND F.GF_COD IN (?GF_COD) AND F.GF_COD NOT IN (?GF_COD_EXCLUDED) AND F.GF_ITEM_STATUS_FLAG IN (?GF_ITEM_STATUS_FLAG) AND (1=2 ?GF_SUB_GROUP )"
	var result = new Array();
	var singleQuote = "'";

	if (!lstCapIds) {
		lstCapIds = [capId];
	}

	var _defaultcapIds = "";
	var _defaultGF_FEE_SCHEDULE = "GF_FEE_SCHEDULE";
	var _defaultGF_FEE_PERIOD = "GF_FEE_PERIOD";
	var _defaultGF_COD = "GF_COD";
	var _defaultGF_COD_EXCLUDED = "'-2'";
	var _defaultGF_ITEM_STATUS_FLAG = "GF_ITEM_STATUS_FLAG";
	var _defaultGF_SUB_GROUP = "OR 1=1";

	var capIds = _defaultcapIds;
	var GF_FEE_SCHEDULE = _defaultGF_FEE_SCHEDULE;
	var GF_FEE_PERIOD = _defaultGF_FEE_PERIOD;
	var GF_COD = _defaultGF_COD;
	var GF_COD_EXCLUDED = _defaultGF_COD_EXCLUDED;
	var GF_ITEM_STATUS_FLAG = _defaultGF_ITEM_STATUS_FLAG;
	var GF_SUB_GROUP = _defaultGF_SUB_GROUP;

	if (lstCapIds) {
		for (c in lstCapIds) {
			var itemCapId = lstCapIds[c];
			var itemCap = aa.cap.getCap(itemCapId).getOutput();
			var capIDArray = itemCapId.toString().split("-");
			if (capIDArray.length == 3) {
				perId1 = singleQuote + capIDArray[0] + singleQuote;
				perId2 = singleQuote + capIDArray[1] + singleQuote;
				perId3 = singleQuote + capIDArray[2] + singleQuote;
			}

			capIds += " OR (F.B1_PER_ID1 = " + perId1 + " AND F.B1_PER_ID2 = " + perId2 + " AND F.B1_PER_ID3 = " + perId3 + ")";
		}

		for (qIdx in _query) {
			var qObj = _query[qIdx];

			if (qObj.feeSchedules.length > 0) {
				if (GF_FEE_SCHEDULE != _defaultGF_FEE_SCHEDULE) {
					GF_FEE_SCHEDULE += ",";
				} else {
					GF_FEE_SCHEDULE = "";
				}
				GF_FEE_SCHEDULE += singleQuote + qObj.feeSchedules.join("','").toString() + singleQuote;
			}

			if (qObj.excludedFeeCodes.length > 0) {
				if (GF_COD_EXCLUDED != _defaultGF_COD_EXCLUDED) {
					GF_COD_EXCLUDED += ",";
				} else {
					GF_COD_EXCLUDED = "";
				}
				GF_COD_EXCLUDED += singleQuote + qObj.excludedFeeCodes.join("','").toString() + singleQuote;
			}

			if (qObj.feeCodes.length > 0) {
				if (GF_COD != _defaultGF_COD) {
					GF_COD += ",";
				} else {
					GF_COD = "";
				}
				GF_COD += singleQuote + qObj.feeCodes.join("','").toString() + singleQuote;
			}

			if (qObj.feeStatuses.length > 0) {
				if (GF_ITEM_STATUS_FLAG != _defaultGF_ITEM_STATUS_FLAG) {
					GF_ITEM_STATUS_FLAG += ",";
				} else {
					GF_ITEM_STATUS_FLAG = "";
				}
				GF_ITEM_STATUS_FLAG += singleQuote + qObj.feeStatuses.join("','").toString() + singleQuote;
			}

			if (qObj.paymentPeriods.length > 0) {
				if (GF_FEE_PERIOD != _defaultGF_FEE_PERIOD) {
					GF_FEE_PERIOD += ",";
				} else {
					GF_FEE_PERIOD = "";
				}
				GF_FEE_PERIOD += singleQuote + qObj.paymentPeriods.join("','").toString() + singleQuote;
			}

			if (qObj.subGroups.length > 0) {
				if (GF_SUB_GROUP == _defaultGF_SUB_GROUP) {
					GF_SUB_GROUP = "";
				}
				for (sg in qObj.subGroups) {
					var subGroup = qObj.subGroups[sg];
					GF_SUB_GROUP += " OR ','||GF_SUB_GROUP||',' LIKE '%," + subGroup + ",%'";
				}
			}
		}


		_q = _q.replace("?ServProvCode", servProvCode);
		_q = _q.replace("?capIds", capIds);
		_q = _q.replace("?GF_FEE_SCHEDULE", GF_FEE_SCHEDULE);
		_q = _q.replace("?GF_COD_EXCLUDED", GF_COD_EXCLUDED);
		_q = _q.replace("?GF_COD", GF_COD);
		_q = _q.replace("?GF_ITEM_STATUS_FLAG", GF_ITEM_STATUS_FLAG);
		_q = _q.replace("?GF_FEE_PERIOD", GF_FEE_PERIOD);
		_q = _q.replace("?GF_SUB_GROUP", GF_SUB_GROUP);

		loadFees_ByQuery_Query(_q, result);
	}
	return result;
}

function loadFees_ByQuery_Query(q, r) {
	var initialContext = aa.proxyInvoker.newInstance("javax.naming.InitialContext", null).getOutput();
	var ds = initialContext.lookup("java:/AA");
	var conn = ds.getConnection();
	var sStmt = conn.prepareStatement(q);
	//logDebug("q: " + q);

	var rSet = sStmt.executeQuery();
	while (rSet.next()) {
		var myFee = new _Fee();
		var amtPaid = 0;

		myFee.sequence = rSet.getString("FEEITEM_SEQ_NBR");
		myFee.code = rSet.getString("GF_COD");
		myFee.sched = rSet.getString("GF_FEE_SCHEDULE");
		myFee.description = rSet.getString("GF_DES");
		myFee.unit = parseFloat(rSet.getString("GF_UNIT")) || 0;
		myFee.amount = parseFloat(rSet.getString("GF_FEE")) || 0;
		myFee.amountPaid = parseFloat(rSet.getString("GF_PAYMENT_AMOUNT")) || 0;
		var applyDate = rSet.getString("GF_FEE_APPLY_DATE");
		if (!isBlank(applyDate)) {
			myFee.applyDate = applyDate;
		}
		var effDate = rSet.getString("GF_FEE_EFFECT_DATE");
		if (!isBlank(effDate)) {
			myFee.effectDate = effDate;
		}
		var expDate = rSet.getString("GF_FEE_EXPIRE_DATE");
		if (!isBlank(expDate)) {
			myFee.expireDate = expDate;
		}
		myFee.status = rSet.getString("GF_ITEM_STATUS_FLAG");
		myFee.period = rSet.getString("GF_FEE_PERIOD");
		myFee.display = rSet.getString("GF_DISPLAY");
		myFee.accCodeL1 = rSet.getString("GF_L1");
		myFee.accCodeL2 = rSet.getString("GF_L2");
		myFee.accCodeL3 = rSet.getString("GF_L3");
		myFee.formula = rSet.getString("GF_FORMULA");
		myFee.udes = rSet.getString("GF_UDES");
		myFee.UDF1 = rSet.getString("F4FEEITEM_UDF1");
		myFee.UDF2 = rSet.getString("F4FEEITEM_UDF2");
		myFee.UDF3 = rSet.getString("F4FEEITEM_UDF3");
		myFee.UDF4 = rSet.getString("F4FEEITEM_UDF4");
		myFee.subGroup = rSet.getString("GF_SUB_GROUP");
		myFee.calcFlag = rSet.getString("GF_FEE_CALC_FLAG");
		myFee.calcProc = rSet.getString("GF_CAL_PROC");
		myFee.version = rSet.getString("FEE_SCHEDULE_VERSION");
		r.push(myFee);
	}
	sStmt.close();
}

function _Fee() {
	this.sequence = null;
	this.code = null;
	this.description = null; // getFeeDescription()
	this.unit = null; //  getFeeUnit()
	this.amount = null; //  getFee()
	this.amountPaid = null;
	this.applyDate = null; // getApplyDate()
	this.effectDate = null; // getEffectDate();
	this.expireDate = null; // getExpireDate();
	this.status = null; // getFeeitemStatus()
	this.recDate = null;
	this.period = null; // getPaymentPeriod()
	this.display = null; // getDisplay()
	this.accCodeL1 = null; // getAccCodeL1()
	this.accCodeL2 = null; // getAccCodeL2()
	this.accCodeL3 = null; // getAccCodeL3()
	this.formula = null; // getFormula()
	this.udes = null; // String getUdes()
	this.UDF1 = null; // getUdf1()
	this.UDF2 = null; // getUdf2()
	this.UDF3 = null; // getUdf3()
	this.UDF4 = null; // getUdf4()
	this.subGroup = null; // getSubGroup()
	this.calcFlag = null; // getCalcFlag();
	this.calcProc = null; // getFeeCalcProc()
	this.auditDate = null; // getAuditDate()
	this.auditID = null; // getAuditID()
	this.auditStatus = null; // getAuditStatus()
	this.version = null; // getVersion()
}

function getFeeEngine_icbo(formula, value) {
	var v = parseFloat(value);
	var workArr = formula.split(",");
	var result = 0;
	var prevMinRange = 0;
	var minRange = 0;
	var minFee = 0;
	var prevMinFee = 0;
	var factor = 0;
	var prevFactor = 0;
	var base = 0;
	var prevBase = 0;
	for (var i = -1; i <= parseInt((workArr.length - 1)); i = i + 4) {
		prevMinRange = minRange;
		prevMinFee = minFee;
		prevFactor = factor;
		prevBase = base;
		minRange = (i < 0) ? 0 : parseFloat(workArr[i]);
		var minFee = parseFloat(workArr[1 + i]);
		var factor = parseFloat(workArr[2 + i]);
		var base = parseInt(workArr[3 + i]);
		logDebug("getFeeEngine_icbo: value $:" + v + "  R:" + minRange + "  M:" + minFee + "  N:" + factor + "  B:" + base);
		if (v <= minRange) {
			if (v == minRange) { // the whole reason we have custom code!
				result = (parseFloat(minFee) + parseFloat(Math.ceil((v - minRange) / base) * factor)).toFixed(2);
				logDebug("getFeeEngine_icbo: calculating: " + minFee + " + (Math.ceil((" + v + "-" + minRange + ")/" + base + ") * " + factor + ") = " + result);
				return result;
			} else {
				result = (parseFloat(prevMinFee) + parseFloat(Math.ceil((v - prevMinRange) / prevBase) * prevFactor)).toFixed(2);
				logDebug("getFeeEngine_icbo: calculating: " + prevMinFee + " + (Math.ceil((" + v + "-" + prevMinRange + ")/" + prevBase + ") * " + prevFactor + ") = " + result);
				return result;
			}
		}
	}
	// last range
	result = (parseFloat(minFee) + parseFloat(Math.ceil((v - minRange) / base) * factor)).toFixed(2);
	logDebug("getFeeEngine_icbo: calculating: " + minFee + " + (Math.ceil((" + v + "-" + minRange + ")/" + base + ") * " + factor + ") = " + result);
	return result;
}

function getFeeEngine_icbo_noceiling(formula, value) {
	var v = parseFloat(value);
	var workArr = formula.split(",");
	var result = 0;
	var prevMinRange = 0;
	var minRange = 0;
	var minFee = 0;
	var prevMinFee = 0;
	var factor = 0;
	var prevFactor = 0;
	var base = 0;
	var prevBase = 0;
	for (var i = -1; i <= parseInt((workArr.length - 1)); i = i + 4) {
		prevMinRange = minRange;
		prevMinFee = minFee;
		prevFactor = factor;
		prevBase = base;
		minRange = (i < 0) ? 0 : parseFloat(workArr[i]);
		var minFee = parseFloat(workArr[1 + i]);
		var factor = parseFloat(workArr[2 + i]);
		var base = parseInt(workArr[3 + i]);
		logDebug("getFeeEngine_icbo_noceiling: value $:" + v + "  R:" + minRange + "  M:" + minFee + "  N:" + factor + "  B:" + base);
		if (v <= minRange) {
			if (v == minRange) { // the whole reason we have custom code!
				result = (parseFloat(minFee) + parseFloat(((v - minRange) / base) * factor)).toFixed(2);
				logDebug("getFeeEngine_icbo_noceiling: calculating: " + minFee + " + (((" + v + "-" + minRange + ")/" + base + ") * " + factor + ") = " + result);
				return result;
			} else {
				result = (parseFloat(prevMinFee) + parseFloat(((v - prevMinRange) / prevBase) * prevFactor)).toFixed(2);
				logDebug("getFeeEngine_icbo_noceiling: calculating: " + prevMinFee + " + (((" + v + "-" + prevMinRange + ")/" + prevBase + ") * " + prevFactor + ") = " + result);
				return result;
			}
		}
	}
	// last range
	result = (parseFloat(minFee) + parseFloat(((v - minRange) / base) * factor)).toFixed(2);
	logDebug("getFeeEngine_icbo_noceiling: calculating: " + minFee + " + (((" + v + "-" + minRange + ")/" + base + ") * " + factor + ") = " + result);
	return result;
}

function getFeeEngine_CheckIfInSubGroup(subGroupArray, matchArray) {
	for (g in subGroupArray) {
		var group = subGroupArray[g];
		if (exists(group, matchArray)) {
			return true;
		}
	}
	return false;
}

function getFeeEngine_ExtensionLength(_wfStatus, _newExpiration) {
	var length = 1;

	logDebug("_new:" + _new);
	var _current;
	var _defaultExpiration;


	if (_wfStatus == 'Assess Application Extension Fees') {
		_current = AInfo['Application Expiration Date'];
		logDebug("_current:" + _current);
		_defaultExpiration = getNewAppExtensionDate();
		logDebug("_defaultExpiration:" + _defaultExpiration);
	} else {
		_current = AInfo['Permit Expiration Date'];
		logDebug("_currentPermit:" + _current);
		_defaultExpiration = getNewPermitExtensionDate();
		logDebug("_defaultExpirationPermit:" + _defaultExpiration);
	}

	if (_newExpiration && _current && _defaultExpiration) {
		var _defaultDiff = dateDiff(_current, _defaultExpiration);
		logDebug("_defaultDiff:" + _defaultDiff);
		var _newDateDiff = dateDiff(_current, _newExpiration);
		logDebug("_newDateDiff:" + _newDateDiff);
		var _diff = _newDateDiff - _defaultDiff;
		logDebug("_diff:" + _diff);
		if (_diff > 1) {
			var _diffYears = _diff / _defaultDiff;
			logDebug("_diffYears:" + _diffYears);
			if (_diffYears > 1) {
				length = Math.ceil(_diffYears);
				logDebug("length:" + length);
			}
		}
	}

	return length;
}

function invoiceFeesFromWorkflowCONF() {
	//NOTETODO: not tested!!
	var invoice = false;

	var itemCap = capId;
	if (arguments.length == 1)
		itemCap = arguments[0];

	var currentTask = aa.workflow.getTask(itemCap, wfTask);
	var nextTask = "";

	if (currentTask.getSuccess()) {
		currentTask = currentTask.getOutput();
		var process = aa.workflow.getProcess(itemCap, currentTask.getProcessID());
		if (process.getSuccess()) {
			process = process.getOutput();

			for (var p = 0; p < process.length; p++) {
				if (process[p].getCurrentTaskID() == currentTask.getNextTaskID()) {
					nextTask = process[p].getTaskDescription();

					var AutoInvoiceFeesTask = aa.bizDomain.getBizDomain('AutoInvoiceFeesTask');

					if (AutoInvoiceFeesTask.getSuccess()) {
						AutoInvoiceFeesTask = AutoInvoiceFeesTask.getOutput();
						for (var rt = 0; rt < AutoInvoiceFeesTask.size(); rt++) {
							var isMatch = true;
							var matchArray = AutoInvoiceFeesTask.get(rt).getBizdomainValue().split('/');

							for (var xx in matchArray) {
								if (!appTypeArray[xx].equals(matchArray[xx]) && !matchArray[xx].equals("*")) {
									isMatch = false;
								}
								if (isMatch && AutoInvoiceFeesTask.get(rt).getDescription() == nextTask) {
									invoice = true;
									break;
								}
							}
							if (invoice) break;
						}
					} else {
						break;
					}
				}
				if (invoice) break;
			}
		}
	}

	if (invoice) {
		invoiceAllFees();
	}

	return invoice;
}

function removeFeeIfNewOrUnpaid(fcode, fperiod) {
	var itemCap = capId
	if (arguments.length > 2)
		itemCap = arguments[2]; // use cap ID specified in args

	getFeeResult = aa.finance.getFeeItemsByFeeCodeAndPeriod(itemCap, fcode, fperiod, "");
	if (getFeeResult.getSuccess()) {
		var feeList = getFeeResult.getOutput();
		for (feeNum in feeList) {
			if (feeList[feeNum].getFeeitemStatus().equals("NEW")) {
				var feeSeq = feeList[feeNum].getFeeSeqNbr();

				var editResult = aa.finance.removeFeeItem(itemCap, feeSeq);
				if (editResult.getSuccess()) {
					logDebug("Removed existing Fee Item: " + fcode);
				} else {
					logDebug("**ERROR: removing fee item (" + fcode + "): " + editResult.getErrorMessage());
					break;
				}
			}
			if (feeList[feeNum].getFeeitemStatus().equals("INVOICED")) {
				if (amountPaidByFeeSeq(feeList[feeNum].getFeeSeqNbr()) == 0) {
					logDebug("Invoiced fee hasn't been paid, voiding");
					voidResult = aa.finance.voidFeeItem(capId, feeList[feeNum].getFeeSeqNbr());
				} else {
					logDebug("Invoiced fee has a payment, not voiding");
				}
			}
		}
	} else {
		logDebug("**ERROR: getting fee items (" + fcode + "): " + getFeeResult.getErrorMessage())
	}
}

function amountPaidByFeeSeq(feeSeq) {
	// Searches payment fee items and returns the unpaid balance of a fee item
	// Sums fee items if more than one exists.  Optional second parameter fee schedule
	var amtPaid = 0;
	var itemCap = capId;
	if (arguments.length == 2)
		itemCap = arguments[1];

	var pfResult = aa.finance.getPaymentFeeItems(capId, null);
	if (pfResult.getSuccess()) {
		var pfObj = pfResult.getOutput();
		for (var ij in pfObj)
			if (feeSeq == pfObj[ij].getFeeSeqNbr())
				amtPaid += pfObj[ij].getFeeAllocation();
	}

	return amtPaid;
}