var feeitemCap;
var _FeeQueryHistory = [];
var _feesArr;
var _feesLoaded = false;

eval(getScriptText("INCLUDES_FEE_ENGINE_CUST"));
eval(getScriptText("INCLUDES_FEE_ENGINE_UTIL"));
eval(getScriptText("INCLUDES_FEE_ENGINE_PENL"));
eval(getScriptText("INCLUDES_FEE_ENGINE_TMPP"));

function feeEngine() {
    var loadList = null;

    try {
        logDebug("::feeEngine...instantiating");
        _itemCap = capId;
        _loadList = false;

        if (arguments.length && typeof arguments[0] === 'object' && arguments[0] !== null) {
            var params = arguments[0];
            if (params.capId) {
                _itemCap = params.capId;
            }

            if (params.loadList) {
                loadList = params.loadList;
            }
        }

        if (loadList) {
            this.fees = getFeeEngineConfig(_timing, _itemCap, _TSI, loadList);
        } else {
            this.fees = getFeeEngineConfig(_timing, _itemCap, _TSI);
        }

        _itemCap = getFeeEngine_OverrideCapId();
        _iCap = aa.cap.getCap(_itemCap).getOutput();

        var _TESTFILTER = false; // ignore existing fees, only used for regression testing!
        if (typeof _FILTERUDF4 != "undefined") {
            logDebug("::feeEngine...TEST FILTER: " + _TESTFILTER + " is ACTIVE!  Each fee will be set with UDF4 of this value.   Any existing fee without this value will be ignored for calculations!!!");
            _TESTFILTER = _FILTERUDF4; // stamp every fee UDF4 with this value, and we will recognize these for calcs.        }
        }

        var _TSI = [];
        var wfTSIKey;
        if (exists(vEventName, ['WorkflowTaskUpdateAfter'])) {
            useTaskSpecificGroupName = true;
            loadTaskSpecific(_TSI);
            useTaskSpecificGroupName = false;
            wfTSIKey = wfProcess + "." + wfTask + ".";
        }

        var tp = getFeeEngineCurrTimingAndPayPeriod();
        var _timing = tp.timing;
        var _updateByAmtTypes = ["ICBO_STYLE_ENHANCED"];
        var _templateFee;
        var _waiverDoNotAssessFee = true; // if true, we won't assess the fee.  otherwise, adjust it out.  TODO

        this.timing = tp.timing;

        logDebug("::feeEngine _timing " + _timing);
        logDebug("::feeEngine _paymentPeriod " + getFeeEngineCurrTimingAndPayPeriod().paymentPeriod);

        this.getExistingFeeMap = function () {
            var resultArray = [];
            // use globals for std functions
            appTypeResult = cap.getCapType();
            appTypeString = appTypeResult.toString();
            appTypeArray = appTypeString.split("/");

            var fl = this.loadFeesJSON();
            for (var thisF in fl) {
                var f = fl[thisF];
                var result = {};
                logDebug("::feeEngine:getExistingFeeMap[" + thisF + "] " + JSON.stringify(f));
                result.fee = f;
                var candidates = this.fees.filter(function (o) {
                    var matchesRT = false;
                    for (var i in o.recordTypes) {
                        if (appMatch(o.recordTypes[i].mask)) {
                            matchesRT = true;
                            break;
                        }
                    }
                    if (!matchesRT) {
                        return false;
                    }
                    if (!o.feeCode.equals(f.code)) {
                        return false;
                    }
                    //if (!String(eval(o.defaultPeriod)).equals(f.period)) { return false; }
                    if (!o.feeSchedule.equals(f.sched)) {
                        return false;
                    }
                    logDebug("::feeEngine:getExistingFeeMap[" + thisF + "] found a matching feeConfig entry : " + JSON.stringify(o));
                    return true;
                });
                if (candidates.length == 0) {
                    logDebug("::feeEngine:getExistingFeeMap[" + thisF + "] ERROR no matching fee in config");
                    result.error = true;
                    result.errorMessage = "No matching fee found in fee engine configuaration";
                }
                if (candidates.length > 1) {
                    logDebug("::feeEngine:getExistingFeeMap[" + thisF + "] ERROR more than one matching fee in config");
                    result.error = true;
                    result.errorMessage = "More than one matching fee was found in fee engine configuration";
                }
                if (candidates.length == 1) {
                    result.feeConfig = candidates[0];
                }
                resultArray.push(result);
            }
            return resultArray;
        };

        this.validateFeeMap = function (fm) {
            for (var i in fm) {
                var fi = fm[i];
                logDebug("fi.feeConfig[" + i + "] is " + fi.feeConfig);
                if (fi.feeConfig && fi.feeConfig.defaultCriteria) { // if no fee config we already have an error
                    logDebug("evaluating : " + fi.feeConfig.defaultCriteria);
                    if (eval(fi.feeConfig.defaultCriteria)) {
                        logDebug("::feeEngine:validateFeeMap[" + i + "] criteria success");
                    } else {
                        fi.error = true;
                        fi.errorMessage = "defaultCriteria is false : " + fi.feeConfig.defaultCriteria;
                        logDebug("::feeEngine:validateFeeMap[" + i + "] ERROR default criteria is false : " + fi.feeConfig.defaultCriteria);
                    }
                }
            }
            return fm;
        };

        this.getFeeCandidates = function () {
            // check for record type mask and event match
            var candidates = this.fees.filter(function (o) {
                if (o.grandfathered) { // effective dates only matter on gf fees
                    eval("var gfDate = convertDate(" + o.grandfatherDate + ");");
                    if (o.dateEffective) {
                        var dateEff = convertDate(o.dateEffective);
                        if (gfDate < dateEff) {
                            return false;
                        }
                    }
                    if (o.dateDisabled) {
                        var dateDis = convertDate(o.dateDisabled);
                        if (gfDate > dateDis) {
                            return false;
                        }
                    }
                }
                var matchType = false;
                for (var i in o.recordTypes) {
                    var maskIgnore = o.recordTypes[i].maskIgnore ? o.recordTypes[i].maskIgnore : [];
                    if (appMatch(o.recordTypes[i].mask) && !appMatchArray(o.recordTypes[i].maskIgnore)) {
                        if (o.recordTypes[i].timing) { // non-default timing
                            for (var j in o.recordTypes[i].timing) {
                                var _j = o.recordTypes[i].timing[j];
                                if (_j == _timing) {
                                    matchType = true;
                                    break;
                                }
                            }
                        }
                        if (o.defaultTiming) {
                            for (var k in o.defaultTiming) {
                                var _k = o.defaultTiming[k];
                                if (_k == _timing) {
                                    matchType = true;
                                    break;
                                }
                            }
                        }
                    }
                }
                return matchType;
            });

            candidates.sort(function (a, b) {
                return a.sequenceOrder - b.sequenceOrder;
            });

            logDebug("::feeEngine.getFeeCandidates() returning " + candidates.length + " fee candidates");
            return candidates;
        };

        this.assessFees = function () {
            var feeList = this.getFeeCandidates();
            for (var i in feeList) {
                var fo = feeList[i];
                if (_TESTFILTER) {
                    fo.UDF4 = _TESTFILTER; // regression testing only!
                }
                for (var j in fo.recordTypes) {
                    if (appMatch(fo.recordTypes[j].mask)) {
                        var timingCriteria = fo.recordTypes[j].timingCriteria ? fo.recordTypes[j].timingCriteria : fo.defaultTimingCriteria;
                        var timingCriteriaResult = false;
                        if (timingCriteria) {
                            eval("var timingCriteriaResult = (" + timingCriteria + ");");
                        }
                        if (timingCriteriaResult) {
                            var criteria = fo.recordTypes[j].criteria ? fo.recordTypes[j].criteria : fo.defaultCriteria;
                            var criteriaResult = false;
                            if (criteria) {
                                eval("var criteriaResult = (" + criteria + ");");
                            }
                            var period = fo.recordTypes[j].period ? fo.recordTypes[j].period : fo.defaultPeriod;
                            var remove = fo.recordTypes[j].removeIfFalse ? fo.recordTypes[j].removeIfFalse : fo.defaultRemoveIfFalse;
                            if (criteriaResult) {
                                logDebug("::feeEngine.assessFees() [" + i + "] seq: " + fo.sequenceOrder + ", fee code: " + fo.feeCode + " matches record type, timing, and criteria");
                                // passed criteria, so let's add the feeCode
                                var unitsFormula = fo.recordTypes[j].units ? fo.recordTypes[j].units : fo.defaultUnits;
                                var units;
                                if (unitsFormula) {
                                    eval("var units = (" + unitsFormula + ");");
                                    logDebug("::feeEngine.assessFees() units formula (" + unitsFormula + ") evaluates to " + units);
                                    var cumulative = fo.recordTypes[j].cumulativeUnits ? fo.recordTypes[j].cumulativeUnits : fo.defaultCumulativeUnits;
                                    var reapply = fo.recordTypes[j].reapplyFee ? fo.recordTypes[j].reapplyFee : fo.defaultReapplyFee;
                                    var invoice = fo.recordTypes[j].invoice ? fo.recordTypes[j].invoice : fo.defaultInvoice;
                                    var offsetAmt = fo.recordTypes[j].offsetAmt ? fo.recordTypes[j].offsetAmt : fo.defaultOffsetAmt;
                                    var offsetPct = fo.recordTypes[j].offsetPct ? fo.recordTypes[j].offsetPct : fo.defaultOffsetPct;
                                    var waiver = fo.recordTypes[j].waiverCriteria ? fo.recordTypes[j].waiverCriteria : fo.defaultWaiverCriteria;
                                    logDebug("::feeEngine.assessFees() invoice evaluates to " + invoice);
                                    var notes = fo.recordTypes[j].notes ? fo.recordTypes[j].notes : fo.defaultNotes;
                                    if (isNaN(units)) {
                                        logDebug("::feeEngine.assessFees() units formula did not result in a number. The fee will not be assessed");
                                    } else {
                                        if (units == 0) {
                                            removeFeeIfNewOrUnpaid(fo.feeCode, period, _itemCap);
                                        } else {
                                            var fi = {}; // create fee instance
                                            fi.feeCode = String(fo.feeCode);
                                            fi.cumulative = cumulative;
                                            fi.reapply = reapply;
                                            fi.feeSchedule = String(fo.feeSchedule);
                                            fi.period = String(period);
                                            fi.invoice = (invoice);
                                            fi.units = String(units);
                                            fi.grandfathered = fo.grandfathered;
                                            fi.grandfatherDate = String(fo.grandfatherDate);
                                            fi.waiverCriteria = waiver;
                                            fi.customCalcFunction = fo.customCalcFunction;
                                            //testing value: fi.customCalcFunction = "ccsf_icbo(fi.formula,estValue);"
                                            if (notes)
                                                fi.UDF3 = String(notes);
                                            if (fo.UDF1)
                                                fi.UDF1 = String(fo.UDF1);
                                            if (fo.UDF2)
                                                fi.UDF2 = String(fo.UDF2);
                                            if (fo.UDF3)
                                                fi.UDF3 = String(fo.UDF3);
                                            if (fo.UDF4)
                                                fi.UDF4 = String(fo.UDF4);
                                            if (offsetAmt)
                                                fi.offsetAmt = offsetAmt;
                                            if (offsetPct)
                                                fi.offsetPct = offsetPct;
                                            var doFeeResult = this.calcFee(fi);
                                        }
                                    }
                                } else {
                                    logDebug("::feeEngine.assessFees() no unit formula found for this fee object. The fee will not be assessed");
                                }

                                // remove other fees in uniqueFeeGroup
                                if (fo.uniqueFeeGroup) {
                                    logDebug("::feeEngine.assessFees() removing any existing fees in unique fee Group: " + fo.uniqueFeeGroup);
                                    var candidates = this.fees.filter(function (o) {
                                        return o.uniqueFeeGroup == fo.uniqueFeeGroup;
                                    });
                                    for (var icandidate in candidates) {
                                        if (candidates[icandidate].feeCode != fo.feeCode) {
                                            removeFee(candidates[icandidate].feeCode, candidates[icandidate].defaultPeriod, _itemCap);
                                        }
                                    }
                                }
                                // end remove
                            } else if (remove) {
                                logDebug("removing fee code: " + fo.feeCode + " period: " + period);
                                // remove this fee since it shouldn't be there
                                logDebug("::feeEngine.assessFees() [" + i + "] seq: " + fo.sequenceOrder + ", fee code: " + fo.feeCode + " DID NOT match criteria (" + criteria + "), removing if it exists");
                                removeFeeIfNewOrUnpaid(fo.feeCode, period, _itemCap);
                            } else {
                                logDebug("::feeEngine.assessFees() [" + i + "] seq: " + fo.sequenceOrder + ", fee code: " + fo.feeCode + " DID NOT match criteria (" + criteria + ") not removing if it exists.");
                            }
                        } // didn't meeting timing criteria
                        else {
                            logDebug("::feeEngine.assessFees() [" + i + "] seq: " + fo.sequenceOrder + ", fee code: " + fo.feeCode + " DID NOT meet timing criteria (" + timingCriteria + ")");

                        }
                    } else {
                        logDebug("::feeEngine.assessFees() [" + i + "] seq: " + fo.sequenceOrder + ", fee code: " + fo.feeCode + " DID NOT match this record type, uses mask " + fo.recordTypes[j].mask);
                    }
                }

            }
        };

        this.calcFee = function (fi) {
            logDebug("::feeEngine.calcFee() : " + JSON.stringify(fi));
            var voidFeeList = [];
            var voidFeePeriodList = [];
            var removeFeeList = [];
            var voidFeeAmount = 0;
            var voidFeeQty = 0;
            var removeFeeAmount = 0;
            var removeFeeQty = 0;
            var paidFeeAmount = 0;
            var paidFeeQty = 0;
            var invFeeFound = false;
            var adjustedQty = fi.units;
            var adjustedAmt = 0;
            var feeSeq = null;
            var feeUpdated = false;
            var tempFeeSeq = null;
            var currentAmt = 0;
            var originalAmt = 0;
            var updateByAmount = false;
            var noteJSON = {};
            noteJSON.oldFees = [];

            var refFee = this.getRefFee(fi);
            logDebug("::feeEngine.calcFee() obtaining the reference fee object returns " + refFee);

            if (refFee) {
                fi.formula = String(refFee.getFormula());
            }

            // If we are waiving this fee using the "don't assess" style, set units to Zero.
            if (fi.waiverCriteria && _waiverDoNotAssessFee) {
                logDebug("::feeEngine.calcFee() waiverCriteria (" + fi.waiverCriteria + ")");
                if (eval(fi.waiverCriteria)) {
                    logDebug("::feeEngine.calcFee() waiverCriteria Success.  Setting units to zero and all adjustment flags accordingly");
                    fi.units = 0;
                    fi.cumulative = false;
                }
            }

            // look through existing fees
            var getFeeResult = aa.finance.getFeeItemByFeeCode(_itemCap, fi.feeCode, fi.period);
            if (getFeeResult.getSuccess()) {
                var feeList = getFeeResult.getOutput();
                for (var feeNum in feeList) {
                    if (_TESTFILTER && (typeof _FILTER_REMOVE_EXISTING != "undefined") && !eval(_TESTFILTER).equals(feeList[feeNum].getUdf4())) { // only used for regression testing!
                        // we are removing all non-test fees for REGRESSION TESTING ONLY
                        if (feeList[feeNum].getFeeitemStatus().equals("INVOICED")) {
                            logDebug("::feeEngine.calcFee() Voiding legacy fee for REGRESSION TEST, success? " + aa.finance.voidFeeItem(_itemCap, feeList[feeNum].getFeeSeqNbr()).getSuccess());
                        }
                        if (feeList[feeNum].getFeeitemStatus().equals("NEW")) {
                            logDebug("::feeEngine.calcFee() Removing legacy fee for REGRESSION TEST, success? " + aa.finance.removeFeeItem(_itemCap, feeList[feeNum].getFeeSeqNbr()).getSuccess());
                        }
                    }
                    if (_TESTFILTER && !eval(_TESTFILTER).equals(feeList[feeNum].getUdf4())) { // only used for regression testing!
                        continue;
                    }
                    var oldFee = {};
                    oldFee.seq = feeList[feeNum].getFeeSeqNbr();
                    oldFee.units = feeList[feeNum].getFeeUnit();
                    oldFee.fee = feeList[feeNum].getFee();
                    if (feeList[feeNum].getFeeitemStatus().equals("INVOICED")) {
                        var amtPaid = amountPaidByFeeSeq(feeList[feeNum].getFeeSeqNbr());
                        if (amtPaid == 0) { // if invoiced fee is unpaid we will void.
                            logDebug("::feeEngine.calcFee() Invoiced fee " + fi.feeCode + " found of amount $" + feeList[feeNum].getFee() + " units=" + feeList[feeNum].getFeeUnit() + " has no payments and will be voided");
                            voidFeeList.push(feeList[feeNum].getFeeSeqNbr());
                            voidFeePeriodList.push(feeList[feeNum].getPaymentPeriod());
                            voidFeeAmount += feeList[feeNum].getFee();
                            voidFeeQty += feeList[feeNum].getFeeUnit();
                            oldFee.status = "Invoiced and Unpaid";

                        } else {
                            logDebug("::feeEngine.calcFee()  Invoiced fee " + fi.feeCode + " found of amount $" + feeList[feeNum].getFee() + " has payments of $" + amtPaid + " units=" + feeList[feeNum].getFeeUnit() + " and will not be voided");
                            paidFeeAmount += feeList[feeNum].getFee();
                            updateByAmount = true; // since there is a paid fee we probably have to manually modify the difference fee
                            paidFeeQty += feeList[feeNum].getFeeUnit();
                            oldFee.status = "Invoiced and has Payment";
                        }
                    }
                    if (feeList[feeNum].getFeeitemStatus().equals("NEW")) {
                        removeFeeList.push(feeList[feeNum].getFeeSeqNbr());
                        removeFeeAmount += feeList[feeNum].getFee();
                        removeFeeQty += feeList[feeNum].getFeeUnit();
                        oldFee.status = "Uninvoiced";
                        logDebug("::feeEngine.calcFee() Existing uninvoiced fee seq #" + feeList[feeNum].getFeeSeqNbr() + " found of amount $" + feeList[feeNum].getFee() + " units=" + feeList[feeNum].getFeeUnit());
                    }
                    noteJSON.oldFees.push(oldFee);
                }
            } else {
                logDebug("::feeEngine.calcFee() encountered an ERROR: getting fee items (" + fi.feeCode + "): " + getFeeResult.getErrorMessage());
                return false;
            }

            // creating a temp fee to get the new amount if (1. paid invoice of certain types, 2. we have a manual modification)

            if (refFee && !fi.period.equals(String(refFee.getPaymentPeriod()))) {
                logDebug("::feeEngine.calcFee() the reference fee period (" + refFee.getPaymentPeriod() + ") does not match the requested fee period (" + fi.period + "), please check the fee engine config.  Exiting...");
                return false;
            }

            if ((refFee && updateByAmount && _updateByAmtTypes.indexOf(String(refFee.getCalProc())) >= 0) || fi.customCalcFunction || fi.offsetAmt || fi.offsetPct) {
                // updateByAmount is automatic when we have a custom calc.  we still need to create a reference fee object, but we just need it for the template fee
                updateByAmount = true;
                // save the invoice flag
                logDebug("::feeEngine.calcFee() updateByAmount is now true, creating a temp fee");
                var holdInvoice = fi.invoice;
                fi.invoice = false;
                // temporarily add the fee so we can get the amount
                tempFeeSeq = this.addFee(fi);

                // save the template fee as a global in case we need to use it
                if (tempFeeSeq) {
                    var templateFeeList = aa.fee.getFeeItems(_itemCap).getOutput();
                    for (var ff in templateFeeList) {
                        if (templateFeeList[ff].getFeeSeqNbr() == tempFeeSeq) {
                            _templateFee = templateFeeList[ff];
                            // if we are creating a template for a custom function fee, use the function to get the fee.
                            if (fi.customCalcFunction) {
                                if (fi.units > 0) { // if zero assume a waiver.
                                    eval("originalAmt = " + fi.customCalcFunction + ";");
                                }
                            } else {
                                originalAmt = _templateFee.getFee();
                            }
                            break;
                        }
                    }
                }

                if (!_templateFee) {
                    logDebug("::feeEngine.calcFee() ERROR could not read template fee after adding");
                }

                if (tempFeeSeq && tempFeeSeq > 0) {
                    logDebug("::feeEngine.calcFee() Removing temporary fee, success? " + aa.finance.removeFeeItem(_itemCap, tempFeeSeq).getSuccess());
                } else {
                    logDebug("::feeEngine.calcFee() Cannot remove temporary fee, tempFeeSeq is " + tempFeeSeq);
                }

                logDebug("::feeEngine.calcFee() The current amount for this is fee is $" + originalAmt + ".  Using this value for updates");

                var offsetAmt = 0;
                var offsetPct = 1;

                if (fi.offsetAmt) {
                    offsetAmt = parseFloat(eval(fi.offsetAmt));
                    logDebug("::feeEngine.calcFee() calculated an offset Amount of $" + offsetAmt + " based on (" + fi.offsetAmt + ")");
                }

                if (fi.offsetPct) {
                    offsetPct = parseFloat(eval(fi.offsetPct));
                    logDebug("::feeEngine.calcFee() calculated an offset percentage of " + offsetPct + " based on (" + fi.offsetPct + ")");
                }

                if (offsetAmt != 0 && offsetPct != 1) {
                    logDebug("::feeEngine.calcFee() Special case for calculating fee to assess: Since both requested offsets will impact the fee, first apply the offset percentage of " + offsetPct);
                    originalAmt = originalAmt * offsetPct;
                    logDebug("::feeEngine.calcFee() new current amount is $ = " + currentAmt);
                }

                var currentAmt = parseFloat(originalAmt); // save before adjustments

                if (offsetPct != 1) {
                    logDebug("::feeEngine.calcFee() applying offset percentage of " + offsetPct + " to current amount $" + currentAmt);
                    currentAmt = parseFloat(parseFloat(currentAmt) * parseFloat(offsetPct)).toFixed(2);
                    logDebug("::feeEngine.calcFee() new current amount is $" + currentAmt);
                }

                if (offsetAmt != 0) {
                    logDebug("::feeEngine.calcFee() applying offset amount of $" + offsetAmt + " to current amount $" + currentAmt);
                    currentAmt = parseFloat(parseFloat(currentAmt) + parseFloat(offsetAmt)).toFixed(2);
                    logDebug("::feeEngine.calcFee() new current amount is $" + currentAmt);
                }
            }

            // if cumulative, we are adding units on top of existing fees
            if (fi.cumulative) {
                logDebug("::feeEngine.calcFee() cumulative units, so adding requested units: " + fi.units + " to existing fee units: " + (voidFeeQty + paidFeeQty + removeFeeQty));
                fi.units = parseFloat(fi.units) + parseFloat(voidFeeQty) + parseFloat(paidFeeQty) + parseFloat(removeFeeQty);
                logDebug("::feeEngine.calcFee() cumulative units, new requested fee units: " + fi.units);
            }

            var existingFeeTotal = parseFloat(voidFeeAmount + paidFeeAmount + removeFeeAmount);
            logDebug("::feeEngine.calcFee() existing fees total for comparison is $(" + voidFeeAmount + " + " + paidFeeAmount + " + " + removeFeeAmount + ") = " + existingFeeTotal);

            var removeInvoiced = false;
            var removeUninvoiced = false;

            if (updateByAmount) {
                logDebug("::feeEngine.calcFee() (existingFeeTotal != currentAmt && !fi.reapply) : " + (existingFeeTotal != currentAmt && !fi.reapply));
                logDebug("::feeEngine.calcFee() fi.reapply : " + fi.reapply);
                if (existingFeeTotal != currentAmt && !fi.reapply) {
                    if (currentAmt > existingFeeTotal || currentAmt >= voidFeeAmount + paidFeeAmount) { // remove uninvoiced fees and add the delta
                        removeUninvoiced = true;
                        logDebug("::feeEngine.calcFee() removing uninvoiced fees (if any) amount of $" + removeFeeAmount);
                        adjustedAmt = ((currentAmt - voidFeeAmount) - paidFeeAmount).toFixed(2);
                    } else if (currentAmt < paidFeeAmount) { // refund condition
                        adjustedAmt = (currentAmt - paidFeeAmount).toFixed(2);
                        fi.overrideAmt = adjustedAmt;
                        logDebug("::feeEngine.calcFee() current amount is greater than the paid amount of " + paidFeeAmount + " so we will not do anything and add a condition");
                    } else { // nothing left to do but void the invoiced unpaid fees as well as the uninvoiced
                        removeUninvoiced = true;
                        removeInvoiced = true;
                        logDebug("::feeEngine.calcFee() removing uninvoiced fees (if any) amount of $" + removeFeeAmount);
                        logDebug("::feeEngine.calcFee() removing invoiced/unpaid fees (if any) amount of $" + voidFeeAmount);
                        adjustedAmt = (currentAmt - paidFeeAmount).toFixed(2);

                    }
                    logDebug("::feeEngine.calcFee() adjusted amount to be added is now $" + adjustedAmt);
                    fi.overrideAmt = adjustedAmt;
                } else if (fi.reapply) {
                    fi.units = fi.units;
                    logDebug("::feeEngine.calcFee() reapplying fee at " + fi.units);
                } else {
                    logDebug("::feeEngine.calcFee() fees balance! Exiting...");
                    return null;
                }

            } else {
                logDebug("::feeEngine.calcFee() ((voidFeeQty + paidFeeQty + removeFeeQty) != fi.units && !fi.reapply)) : " + ((voidFeeQty + paidFeeQty + removeFeeQty) != fi.units && !fi.reapply));
                logDebug("::feeEngine.calcFee() fi.reapply : " + fi.reapply);
                if ((voidFeeQty + paidFeeQty + removeFeeQty) != fi.units && !fi.reapply) {
                    logDebug("::feeEngine.calcFee() existing fee units total $" + (voidFeeQty + paidFeeQty + removeFeeQty) + " is not equal to new units of $" + fi.units + " .");
                    if (fi.units > (voidFeeQty + paidFeeQty + removeFeeQty) || fi.units >= voidFeeQty + paidFeeQty) { // remove uninvoiced fees and add the delta
                        removeUninvoiced = true;
                        logDebug("::feeEngine.calcFee() removing uninvoiced fees (if any) units of $" + removeFeeQty);
                        fi.units = ((fi.units - voidFeeQty) - paidFeeQty);
                    } else if (currentAmt < paidFeeQty) { // refund condition
                        fi.units = (fi.units - paidFeeQty);
                        logDebug("::feeEngine.calcFee() current qty is greater than the paid qty of " + paidFeeQty + " so we will not do anything and add a condition");
                    } else { // nothing left to do but void the invoiced unpaid fees as well as the uninvoiced
                        removeUninvoiced = true;
                        removeInvoiced = true;
                        logDebug("::feeEngine.calcFee() removing uninvoiced fees (if any) Qty of $" + removeFeeQty);
                        logDebug("::feeEngine.calcFee() removing invoiced/unpaid fees (if any) amount of $" + voidFeeQty);
                        fi.units = (fi.units - paidFeeQty);
                    }
                    logDebug("::feeEngine.calcFee() adjusted units to be added is now $" + fi.units);
                } else if (fi.reapply) {
                    fi.units = fi.units;
                    logDebug("::feeEngine.calcFee() reapplying fee at " + fi.units);
                } else {
                    logDebug("::feeEngine.calcFee() units balance! Exiting...");
                    return null;
                }
            }

            if (removeInvoiced) {
                for (var vf in voidFeeList) {
                    logDebug("::feeEngine.calcFee() Voiding existing unpaid invoiced fee, sequence " + voidFeeList[vf] + ", success? " + aa.finance.voidFeeItem(_itemCap, voidFeeList[vf]).getSuccess());
                    var fsm = aa.finance.getFeeItemByPK(_itemCap, voidFeeList[vf]).getOutput().getF4FeeItem();
                    fsm.setFeeNotes("FEE VOIDED DUE TO RECALCULATION");
                    aa.finance.editFeeItem(fsm);
                }
                if (voidFeeList.length > 0) {
                    logDebug("::feeEngine.calcFee() invoicing all voided fees, success? " + aa.finance.createInvoice(_itemCap, voidFeeList, voidFeePeriodList));
                }
            }

            if (removeUninvoiced) {
                // remove uninvoiced
                for (var vf in removeFeeList) {
                    logDebug("::feeEngine.calcFee() Removing existing uninvoiced fee, sequence " + removeFeeList[vf] + ", success? " + aa.finance.removeFeeItem(_itemCap, removeFeeList[vf]).getSuccess());
                }
            }

            if ((updateByAmount && adjustedAmt < 0) || (!updateByAmount && fi.units < 0)) {
                if (!appHasCondition("Fee", null, "Fee Calculation Requires Refund", null, _itemCap)) {
                    logDebug("::feeEngine.calcFee() adding refund condition");
                    addStdConditionWithComment("Fee", "Fee Calculation Requires Refund", "feeCode:" + fi.feeCode + ", feeSchedule:" + fi.feeSchedule + ", period:" + fi.period + ", quantity:" + fi.units + ", adjustedAmt:" + adjustedAmt, _itemCap);
                } else {
                    logDebug("::feeEngine.calcFee() Didn't add refund condition, it already exists");
                }
            }

            if ((updateByAmount && adjustedAmt > 0) || (!updateByAmount && fi.units > 0) || (fi.reapply)) {
                noteJSON.units = fi.units;
                noteJSON.adjustedAmt = adjustedAmt;
                noteJSON.originalAmt = originalAmt;
                fi.notes = JSON.stringify(noteJSON);
                feeSeq = this.addFee(fi);
                if (feeSeq) {
                    updateFeeItemInvoiceFlag(feeSeq, fi.invoice);
                }
                return feeSeq;
            }
        };

        this.addFee = function (fi) {
            // Updated Script will return feeSeq number or null if error encountered (SR5112)
            logDebug("::feeEngine.addFee() : " + JSON.stringify(fi));
            logDebug("::feeEngine.addFee() : _templateFee is " + _templateFee);
            var assessFeeFromRef = false;
            var assessFeeResult = false;
            var feeSeq_L = []; // invoicing fee for CAP in args
            var paymentPeriod_L = []; // invoicing pay periods for CAP in args
            var feeSeq = null;
            var feeCapMessage = " to " + _itemCap.getCustomID();
            var gfDate = null;

            var vDate = new Date();
            if (fi.grandfathered) {
                eval("var gfDate = convertDate(" + fi.grandfatherDate + ");");
                logDebug("::feeEngine.addFee() grandfathered fee date evaluated to " + gfDate);
                vDate = convertDate(gfDate);
            }

            var v = this.getDefaultVersionByScheduleAndFeeCode(fi, vDate);
            // moving this code for all (gf & non-gf) fees due to fee assessment errors where we don't explicitly provide the version.
            if (!v) {
                logDebug("::feeEngine.addFee() could not determine default version for fee schedule for code " + fi.feeCode + ", schedule " + fi.feeSchedule + ", exiting");
                return false;
            }

            try {

                if (fi.overrideAmt && _templateFee) {
                    // we have an override (the fee is different than the formula) and a template fee to useProductInclude
                    var f4fim = _templateFee.getF4FeeItemModel();
                    f4fim.setFeeCalcProc("CONSTANT");
                    f4fim.setFormula("1");
                    f4fim.setParentFeeItemSeqNbr(null); // try to avoid the cannot delete issue
                    if (fi.overrideAmt) { // override takes precedence
                        f4fim.setFee(fi.overrideAmt);
                        f4fim.setFeeUnit(fi.overrideAmt);
                    } else {
                        eval("var customAmt = " + fi.customCalcFunction + ";");
                        logDebug("::feeEngine.addFee() custom calc function " + fi.customCalcFunction + " returns with a value " + customAmt);
                        f4fim.setFee(parseFloat(customAmt));
                        f4fim.setFeeUnit(parseFloat(customAmt));
                    }
                    //f4fim.setFeeSeqNbr(null);
                    //f4fim.setFeeDescription("ADJUSTED - " + f4fim.getFeeDescription());
                    logDebug("::feeEngine.addFee() attempting to add override fee " + _templateFee.getFeeCod() + " as CONSTANT formula, with " + _templateFee.getFeeUnit() + " units ");
                    assessFeeResult = aa.fee.addFeeItem(_templateFee);
                    _templateFee = null; // reset
                } else {
                    logDebug("::feeEngine.addFee() Attempting to add fee using standard function: " + fi.feeCode + ", Qty:" + fi.units + ", Sched: " + fi.feeSchedule + " Version: " + v);
                    logDebug("::feeEngine.addFee() call = aa.finance.createFeeItem(_itemCap,'" + fi.feeSchedule + "','" + v + "','" + fi.feeCode + "','" + fi.period + "'," + fi.units + ")");
                    assessFeeResult = aa.finance.createFeeItem(_itemCap, fi.feeSchedule, v, fi.feeCode, fi.period, fi.units);
                }

                if (assessFeeFromRef || assessFeeResult.getSuccess()) {

                    _FeeQueryHistory = [];
                    _feesArr;
                    _feesLoaded = false;

                    feeSeq = assessFeeResult.getOutput();
                    logDebug("::feeEngine.addFee() Successfully added Fee, sequence Number " + feeSeq);

                    fsm = aa.finance.getFeeItemByPK(_itemCap, feeSeq).getOutput().getF4FeeItem();


                    var doUpdate = false;
                    if (fi.notes) {
                        fsm.setFeeNotes(fi.notes);
                        doUpdate = true;
                    }
                    if (fi.UDF1) {
                        fsm.setUdf1(eval(fi.UDF1));
                        doUpdate = true;
                    }
                    if (fi.UDF2) {
                        fsm.setUdf2(eval(fi.UDF2));
                        doUpdate = true;
                    }
                    if (fi.UDF3) {
                        fsm.setUdf3(eval(fi.UDF3));
                        doUpdate = true;
                    }
                    if (fi.UDF4) {
                        fsm.setUdf4(eval(fi.UDF4));
                        doUpdate = true;
                    }
                    if (doUpdate) {
                        logDebug("::feeEngine.addFee() Updating fee values success? " + aa.finance.editFeeItem(fsm).getSuccess());
                    }

                    if (fi.invoice) {
                        feeSeq_L.push(feeSeq);
                        paymentPeriod_L.push(getFeeEngineCurrTimingAndPayPeriod().paymentPeriod);
                        var invoiceResult_L = aa.finance.createInvoice(_itemCap, feeSeq_L, paymentPeriod_L);
                        if (invoiceResult_L.getSuccess())
                            logDebug("::feeEngine.addFee() Invoicing assessed fee items" + feeCapMessage + " is successful.");
                        else
                            logDebug("::feeEngine.addFee() encountered an ERROR invoicing the fee items assessed" + feeCapMessage + " was not successful.  Reason: " + invoiceResult.getErrorMessage());
                    }
                    updateFeeItemInvoiceFlag(feeSeq, fi.invoice);
                } else {
                    logDebug("::feeEngine.addFee() encountered an ERROR assessing fee (" + fi.feeCode + "): " + assessFeeResult.getErrorMessage());
                    feeSeq = null;
                }

                return feeSeq;
            } catch (err) {
                logDebug("::feeEngine.addFee() encountered a runtime ERROR assessing fee (" + fi.feeCode + "): " + err.message + ". Line Number: " + err.lineNumber + ". Stack: " + err.stack);
                return false;
            }
        };

        this.getDefaultVersionByScheduleAndFeeCode = function (fi, vDate) {

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
                " AND rfee.fee_schedule_name = '" + fi.feeSchedule + "' " +
                " AND eff_date <= To_date('" + effDateString + "', 'MM/DD/YYYY') " +
                " AND rfee.rec_status = 'A' " +
                " AND ( exp_date IS NULL OR exp_date >= To_date('" + effDateString + "', 'MM/DD/YYYY')) " +
                " AND fee_schedule_version IN(SELECT fee_schedule_version FROM rfeeitem WHERE " +
                " rfeeitem.serv_prov_code = '" + aa.getServiceProviderCode() + "' " +
                " AND rfeeitem.r1_fee_code = '" + fi.feeSchedule + "' " +
                " AND rfeeitem.r1_gf_cod = '" + fi.feeCode + "' " +
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
                        array.push(obj);
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

        };

        this.getRefFee = function (fi) {
            var vDate = new Date();
            var res = null;
            if (fi.grandfathered) {
                eval("var gfDate = convertDate(" + fi.grandfatherDate + ");");
                logDebug("::feeEngine.getRefFee() grandfathered fee date evaluated to " + gfDate);
                vDate = convertDate(gfDate);
            }

            var version = this.getDefaultVersionByScheduleAndFeeCode(fi, vDate);
            if (version == null || version == "") {
                logDebug("::feeEngine.getRefFee() no version for this fee schedule, so can't get a ref fee");
                return false;
            }
            var itemDaoClass = java.lang.Class.forName("com.accela.aa.finance.fee.RFeeItemDAO");
            var dao = com.accela.aa.util.ObjectFactory.getDAOObject(itemDaoClass);
            try {
                res = dao.getRFeeItemByPK(aa.getServiceProviderCode(), fi.feeSchedule, String(version), fi.period, fi.feeCode, null);
            } catch (err) {
                // this API will throw a run time error if not found
                logDebug("::feeEngine.getRefFee() ERROR no reference fee found, please check configuration and/or fee engine config");
            }
            return res;
        };

        this.loadFeesJSON = function () {
            var feeArr = [];
            var feeResult = aa.fee.getFeeItems(_itemCap);
            if (feeResult.getSuccess()) {
                var feeObjArr = feeResult.getOutput();
            } else {
                logDebug("ERROR: getting fee items: " + feeResult.getErrorMessage());
                return false;
            }

            for (var ff in feeObjArr) {
                myFee = {};
                fFee = feeObjArr[ff];
                myFee.sequence = String(fFee.getFeeSeqNbr());
                myFee.code = String(fFee.getFeeCod());
                myFee.sched = String(fFee.getF4FeeItemModel().getFeeSchudle());
                myFee.description = String(fFee.getFeeDescription());
                myFee.unit = String(fFee.getFeeUnit());
                myFee.amount = String(fFee.getFee());
                myFee.status = String(fFee.getFeeitemStatus());
                myFee.period = String(fFee.getPaymentPeriod());
                myFee.version = String(fFee.getF4FeeItemModel().getVersion());
                feeArr.push(myFee);
            }

            return feeArr;
        };

        logDebug("::feeEngine loaded " + this.fees.length + " fee objects");
        logDebug("::feeEngine instantiation complete");
    } catch (e) {
        logDebug("Error Occurred in fee engine " + e);
    }

}