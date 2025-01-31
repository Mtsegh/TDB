const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");
const { generateAut, key } = require("../messageFunctions/botfunction");
const { generateReferenceId, generateRandomString } = require("../middleware/userMiddleware");
const { buydata, buyairtime } = require("../api/api");

// Register User
const registerUser = asyncHandler(async (name, passcode, TId) => {
    try {
        const exists = await User.findOne({ telegramId: TId });
        if (exists) {
            return { message: "User exists." };
        }
        if (!passcode) {
            return { message: 'Passcode expected' };
        }
        if (passcode.length < 4 || passcode.length > 8) {
            return { message: "Passcode must have at least 4 characters and must not exceed 8 characters" };
        }
        
        const aut = generateAut();

        const user = await User.create({
            name: name,
            telegramId: TId,
            passcode: passcode,
            AUT: aut
        });

        if (user) {
            const { AUT, balance } = user;
            return { balance, AUT };
        } else {
            return { message: "Registration failed" };
        }
    } catch (error) {
        return { error: `${error.message}` };
    }
});

// Logout User
const logout = asyncHandler(async (req, res) => {
    try {
        const user = await User.findOne({ AUT: aut });
        
        if (!user) {
            return { message: "User Token Not Found" };
        }
        user.telegramId = null;
        await user.save();
        return { success: "Successfully Logged Out" };
    } catch (error) {
        return { error: `${error.message}\nTry again or contact admin` };
    }
});

// Change Passcode
const changepasscode = asyncHandler(async (aut, passcode) => {
    try {
        if (passcode.length < 4 || passcode.length > 8) {
            return { message: "Passcode must have at least 4 characters and must not exceed 8 characters" };
        }
        const user = await User.findOne({ AUT: aut });
        
        if (!user) {
            return { message: "User not found. Contact admin." };
        }
        
        user.passcode = passcode;
        await user.save();
        return { success: "Passcode saved successfully" };
    } catch (error) {
        return { error: "An error occurred: Invalid User Token" };
    }
});

// Reset Passcode
const accountswitch = asyncHandler(async (TId, aut) => {
    try {
        const user = await User.findOne({ AUT: aut });
        
        if (!user) {
            return { message: "User Token Not Found.\nTry again or contact admin" };
        }
        user.telegramId = TId;
        await user.save();
        return { success: "Login Successful" };
    } catch (error) {
        return { error: `${error.message}\nTry again or contact admin` };
    }
});

// Get User History
const getUserHistory = asyncHandler(async (TId) => {
    try {
        const user = await User.findOne({ telegramId: TId });
        
        if (!user) {
            return { message: "User not found. Contact admin." };
        }
        
        const history = user.transactionHistory;
        return history;
    } catch (error) {
        return { error: `${error.message}\nTry again or contact admin` };
    }
});

// Get Transaction
const getTransaction = asyncHandler(async (TId, referenceId) => {
    try {
        const user = await User.findOne({ telegramId: TId });
        
        if (!user) {
            return { message: "User not found. Please try again or contact admin" };
        }

        if (!referenceId) {
            return { message: "Reference Id required" };
        }
        
        const history = user.transactionHistory;
        const transactionInfo = history.find(tx => tx.referenceId === referenceId);
        
        if (!transactionInfo) {
            return { message: "No transaction found" };
        }
        
        return transactionInfo;
    } catch (error) {
        return { error: `${error.message}\nTry again or contact admin` };
    }
});

// Make Purchase
const makePurchase = asyncHandler(async (TId, typeofservice, info) => {
    try {
        if (!TId || !info) {
            return { message: "Please enter a valid phone number and amount" };
        }
        
        const user = await User.findOne({ telegramId: TId });

        if (!user || !user?.accountstatus) {
            const msg = 'User not found.'
            return { message: `${!user?msg:'Your account has been suspended.'} Contact admin.` };
        }

        const balance = user.balance;
        if (Number(info.amount) > balance) {
            return { message: "Insufficient balance😔" };
        }

        let tranx_res;
        try {
            if (typeofservice === "data") {
                const { network_id, plan_id, phone } = info;
                tranx_res = await buydata(network_id, plan_id, phone);
                console.log(phone);
                
            } else if (typeofservice === "airtime") {
                const { network_id, amount, phone } = info;
                tranx_res = await buyairtime(network_id, amount, phone);
            } else {
                return { message: "Oh no. An error occurred. Please try again or contact admin" };
            }
        } catch (error) {
            return { error: "Transaction failed, please try again" };
        }
        
        if (!tranx_res || tranx_res.Error) {
            return { message: "Unable to process transaction, please try again later" };
        }
        console.log(tranx_res, tranx_res.Error);
        
        user.balance = tranx_res.Status === "successful" ? balance - Number(info.amount) : balance;
        const status = tranx_res.Status === "successful" ? 'completed' : tranx_res.Status;

        const refId = generateRandomString(2, 'NOPACBDEFH');
                
        const newHistory = {
            referenceId: `${tranx_res.id+refId}`,
            amount: Number(info.amount),
            type: info.purchase,
            description: `${info.validity}`,
            provider: key[Number(info.network_id)],
            status: status,
            createdAt: new Date()
        };

        user.transactionHistory.push(newHistory);
        await user.save();
        
        return { newHistory, success: 'Transaction successfull.\nDetails' };
    } catch (error) {
        return { error: `${error.message}\nTry again or contact admin` };
    }
});

// Make Deposit
const makeDeposit = asyncHandler(async (TId, typeofdeposit, info) => {
    try {
        if (!TId || !info) {
            return { message: "Invalid request. Info not complete" };
        }
        
        const user = await User.findOne({ telegramId: TId });

        if (!user) {
            return { message: "User not found. Contact admin." };
        }

        const balance = user.balance;
        let depositamount;
        try {
            depositamount = parseInt(info.amount);
        } catch (error) {
            return { error: `${error.message}\nTry again or contact admin` };
        }
        
        const newbalance = balance + depositamount;
        user.balance = newbalance;

        let verifiedRefId;
        const com = async() => {
            const refId = generateReferenceId('NOPACBDEFH');
            const exists = await User.findOne({ 'transactionHistory.referenceId': refId });
            if (exists) {
                return com();
            }
            verifiedRefId = refId;
        }
        await com();
        
        const newHistory = {
            referenceId: verifiedRefId,
            amount: depositamount,
            type: 'Deposit',
            description: `${typeofdeposit}`,
            status: info.status,
            createdAt: new Date()
        };

        user.transactionHistory.push(newHistory);
        await user.save();

        return { success: 'Deposit Successful', newHistory: newHistory, text: user.accountstatus?'Suspend user' : 'Activate user' };
    } catch (error) {
        return { error: `${error.message}\nTry again or contact admin` };
    }
});

// Verify Transaction
const verifyTransaction = asyncHandler(async (TId, referenceId) => {
    try {
        const user = await User.findOne({ telegramId: TId });
        const transactionToVerify = await User.findOne({ "transactionHistory.referenceId": referenceId });
        
        if (!transactionToVerify || !user || !referenceId) {
            return { message: "Transaction not found" };
        }
        
        let confirmedStatus;
        try {
            // Verification
            const verified = await verify(referenceId.slice(0, 8));
            if (verified) {
                transactionToVerify.status = verified.Status;
                confirmedStatus = await transactionToVerify.save();
            } else {
                return { message: "Verification failed" };
            }
        } catch (error) {
            return { message: "Verification failed" };
        }
        
        return { confirmedStatus };
    } catch (error) {
        return { error: `${error.message}\nTry again or contact admin` };
    }
});

module.exports = {
    registerUser,
    logout,
    changepasscode,
    accountswitch,
    getUserHistory,
    getTransaction,
    makePurchase,
    verifyTransaction,
    makeDeposit
};
