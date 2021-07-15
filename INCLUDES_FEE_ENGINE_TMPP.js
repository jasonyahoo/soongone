function getFeeEngineCurrentTimingConfig() {
	/*JSON_EXAMPLE:
		{
    "Building/Commercial/New/NA": {
        "FILING": [{ // timingName
            "metadata": {
                "description": "the period before review for building records.",
                "operators": {
                    "workflow": "!="
                }
            },
            "criteria": {
                "workflow": {
                    "Plan Review": "_ACTIVE",
                    "Public Review": "_ACTIVE",
                    "Preliminary Plan Review": "_ACTIVE"
				},
				"customFields":{
					"Type of Building": "Store Front"
				},
				"customLists":{
					"PARKINGMETERINFO":{
						"Meter Type": "Long Term"
					}
				}
            },
            "action": {
                "timing": "F"
            }
        }]...
	*/
	/*EXPLANATION:
	  configuration for this function is kept in the file called CONFIGURABLE_FEE_ENGINE_TIMING.json
	  function returns the current timing for fee assessment of the configured record

	  appTypeString: First property of the json it designates the record type for which the
					 configuration is for. "*" cna be used between the "/" as a wildcard
					 only the most specific qualifying appTypeString configuration will be used
					 i.e. if you are passing the record type of Building/Commercial/New/NA and both
					 Building/Commercial/New/* and Building/Commercial/New/NA are in the configuration file Building/Commercial/New/NA will be used
	  timingName: a descriptive name given to the particular configuration, all timingNames for each
				  record type will be evaluated make sure the criteria will only result in 1 being
				  true
	   
	  description: notes on the configuration
	  operators: an object that can contain alternate operators like !=, >, >=, ||, <, and <=
				 to be used in the the criteria section i.e. "workflow":{"||"} to use or in
				 in the workflow section.
	  criteria: using == and && as primary operators if a match occurs the criteria is true and 
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
	  
	  action: what will be returned
		timing - required the timing that will be returned from the function for the record type
	*/
	//NOTE: put your timings per record type in the expected order of occurrence in the life cycle of the record function returns as when it hist the first true rule.

	var config = getScriptText("CONFIGURABLE_FEE_ENGINE_TIMING.json");
	config = JSON.parse(config);
	var timing = "";

	for (var aptyp in config) {
		if (appMatch(aptyp, _itemCap)) {
			for (var possiblePeriods in config[aptyp]) {
				var pp = config[aptyp][possiblePeriods];
				var operators = pp.metadata.operators;
				var criteria = pp.criteria;

				if (pp.criteria.workflow) {
					for (var task in criteria.workflow) {
						var thisTask = aa.workflow.getTask(_itemCap, task);
						if (thisTask.getSuccess()) {
							thisTask = thisTask.getOutput();
							var evalResult = true;
							if (criteria.workflow[task] == "_ACTIVE")
								evalResult = evaluateBooleanVinA("Y", thisTask.getActiveFlag(), getLogicalOp(pp.metadata.operators, "workflow"));
							if (criteria.workflow[task] == "_COMPLETE")
								evalResult = evaluateBooleanVinA("Y", thisTask.getCompleteFlag(), getLogicalOp(pp.metadata.operators, "workflow"));
							evaluateBooleanVinA(criteria.workflow[task], thisTask.getDisposition(), getLogicalOp(pp.metadata.operators, "workflow"));

							if (evalResult) {
								timing = checkPrimaryCriteria(criteria, operators);
							}
						}
					}
				} else if (pp.criteria.inspection) {
				for (var insp in criteria.inspection) {

				}
			} else {
				timing = checkPrimaryCriteria(criteria, operators);
			}
		}

	}
}

return timing;
}

function getFeeEngineCurrentPeriodConfig() {
	/*JSON_EXAMPLE:
		{
    "Building/Commercial/New/NA": { //controlString
        "FILING": [{ //periodName
            "metadata": {
                "description": "the period before review for building records.",
                "operators": {
                    "workflow": "!="
                }
            },
            "criteria": {
                "workflow": {
                    "Plan Review": "_ACTIVE",
                    "Public Review": "_ACTIVE",
                    "Preliminary Plan Review": "_ACTIVE"
				},
				"customFields":{
					"Type of Building": "Store Front"
				},
				"customLists":{
					"PARKINGMETERINFO":{
						"Meter Type": "Long Term"
					}
				}
            },
            "action": {
                "period": "FINAL"
            }
        }]...
	*/
	/*EXPLANATION: 
	  configuration for this function is kept in the file called CONFIGURABLE_FEE_ENGINE_PAYMENT_PERIOD.json
	  function returns the current payment period for the configured record

	  appTypeString: First property of the json it designates the record type for which the
					 configuration is for. "*" cna be used between the "/" as a wildcard
					 only the most specific qualifying appTypeString configuration will be used
					 i.e. if you are passing the record type of Building/Commercial/New/NA and both
					 Building/Commercial/New/* and Building/Commercial/New/NA are in the configuration file Building/Commercial/New/NA will be used
	  periodName: a descriptive name given to the particular configuration, all periodNames for each
				  record type will be evaluated make sure the criteria will only result in 1 being
				  true
	   
	  description: notes on the configuration
	  operators: an object that can contain alternate operators like !=, >, >=, ||, <, and <=
				 to be used in the the criteria section i.e. "workflow":{"||"} to use or in
				 in the workflow section.
	  criteria: using == and && as primary operators if a match occurs the criteria is true and 
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
	  
	  action: what will be returned
		period - required the period that will be returned from the function for the record type
	*/


}

function getFeeEngineCurrTimingAndPayPeriod() {
	//PURPOSE:Use this to establish record and fee periods of payment for each record type

	var ret = {
		timing: "F",
		paymentPeriod: "FINAL"
	};

	var buildingPermits = ["Building/*/*/*"];
	var planningPermits = ["Planning/*/*/*"];
	var zoningPermits = ["Zoning/*/*/*"];
	var firePermits = ["Fire/*/*/*"];
	var enforcementPermits = ["Enforcement/*/*/*"];

	if (appMatchArray(buildingPermits)) {

		return ret;
	}

	if (appMatchArray(planningPermits)) {

		return ret;
	}

	if (appMatchArray(zoningPermits)) {

		return ret;
	}

	if (appMatchArray(firePermits)) {

		return ret;
	}

	if (appMatchArray(enforcementPermits)) {

		return ret;
	}

	return ret;
}