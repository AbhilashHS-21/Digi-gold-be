// src/controllers/kycController.js
import prisma from "../config/db.js";
import { encrypt, decrypt } from "../utils/encryption.js";
import { maskPAN, maskAccount } from "../utils/mask.js";

/**
 * Create or update PAN detail for the authenticated user.
 * Accepts: full_name, pan_number (plain), photo (base64 string optional)
 */
export const upsertPan = async (req, res) => {
  try {
    const userId = req.user.id;
    const { full_name, pan_number, photo } = req.body;
    if (!pan_number || !full_name) {
      return res
        .status(400)
        .json({ message: "full_name and pan_number required" });
    }

    const encryptedPan = encrypt(pan_number);
    const encryptedFullName = encrypt(full_name);

    // photo: base64 optional -> store as Bytes
    let photoBytes = null;
    if (photo) {
      // expect "data:<mime>;base64,AAA..." or raw base64. Strip prefix if present.
      const base64 = photo.includes("base64,")
        ? photo.split("base64,")[1]
        : photo;
      photoBytes = Buffer.from(base64, "base64");
    }

    // Check existing
    const existing = await prisma.panDetail.findFirst({
      where: { user_id: userId },
    });

    let panRecord;
    if (existing) {
      panRecord = await prisma.panDetail.update({
        where: { id: existing.id },
        data: {
          full_name: encryptedFullName,
          pan_number: encryptedPan,
          photo: photoBytes ?? undefined,
          status: "PENDING", // moving to PENDING on update
        },
      });
    } else {
      panRecord = await prisma.panDetail.create({
        data: {
          user_id: userId,
          full_name: encryptedFullName,
          pan_number: encryptedPan,
          photo: photoBytes,
          status: "PENDING",
        },
      });
    }

    // Respond with masked data only
    res.status(201).json({
      id: panRecord.id,
      status: panRecord.status,
      pan_number_masked: maskPAN(pan_number),
      message: "PAN submitted (masked) — pending approval",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Create or update Bank detail for authenticated user.
 * Accepts: full_name, account_no (plain), bank_name, ifsc_code
 */
export const upsertBank = async (req, res) => {
  try {
    const userId = req.user.id;
    const { full_name, account_no, bank_name, ifsc_code } = req.body;
    if (!account_no || !full_name || !bank_name || !ifsc_code) {
      return res
        .status(400)
        .json({
          message: "full_name, account_no, bank_name, ifsc_code required",
        });
    }

    const encAcc = encrypt(account_no);
    const encName = encrypt(full_name);

    const existing = await prisma.bankDetail.findFirst({
      where: { user_id: userId },
    });
    let rec;
    if (existing) {
      rec = await prisma.bankDetail.update({
        where: { id: existing.id },
        data: {
          full_name: encName,
          account_no: encAcc,
          bank_name,
          ifsc_code,
          status: "PENDING",
        },
      });
    } else {
      rec = await prisma.bankDetail.create({
        data: {
          user_id: userId,
          full_name: encName,
          account_no: encAcc,
          bank_name,
          ifsc_code,
          status: "PENDING",
        },
      });
    }

    res.status(201).json({
      id: rec.id,
      status: rec.status,
      account_number_masked: maskAccount(account_no),
      message: "Bank details submitted (masked) — pending approval",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Get KYC details for the owner (decrypted) or admin access via admin route below.
 * For normal user: return masked values only (or decrypted if explicitly requested)
 */
export const getMyKyc = async (req, res) => {
  try {
    const userId = req.user.id;

    const pan = await prisma.panDetail.findFirst({
      where: { user_id: userId },
    });
    const bank = await prisma.bankDetail.findFirst({
      where: { user_id: userId },
    });
    const profile = await prisma.user.findFirst({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        first_name: true,
        last_name: true,
        phone: true,
        current_holdings: true,
        // exclude password_hash by simply not including it
      },
    });


    const result = {};

    if (pan) {
      // decrypt for user (owner) — depending on policy, you may only show masked; here we show masked + status
      const panPlain = decrypt(pan.pan_number);
      result.pan = {
        id: pan.id,
        status: pan.status,
        pan_masked: maskPAN(panPlain),
        full_name: pan.full_name, // do not leak PII here — show only on explicit request
        createdAt: pan.createdAt ?? null,
      };
    } else {
      result.pan = null;
    }

    if (bank) {
      const accPlain = decrypt(bank.account_no);
      result.bank = {
        id: bank.id,
        status: bank.status,
        account_masked: maskAccount(accPlain),
        full_name: bank.full_name,
        bank_name: bank.bank_name,
        ifsc_code: bank.ifsc_code,
        createdAt: bank.createdAt ?? null,
      };
    } else {
      result.bank = null;
    }
    if(profile) {
      result.profile = profile;
    } else {
      result.profile = null;
    }

    return res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Admin-only: fetch decrypted PAN / Bank for verification.
 */
export const adminGetKyc = async (req, res) => {
  try {
    const { userId } = req.params; // admin call: /api/kyc/admin/:userId
    const pan = await prisma.panDetail.findFirst({
      where: { user_id: userId },
    });
    const bank = await prisma.bankDetail.findFirst({
      where: { user_id: userId },
    });

    const result = {};

    if (pan) {
      const panPlain = decrypt(pan.pan_number);
      const namePlain = decrypt(pan.full_name);
      // convert photo bytes to base64 if present
      let photoBase64 = null;
      if (pan.photo) {
        photoBase64 = Buffer.from(pan.photo).toString("base64");
      }
      result.pan = {
        id: pan.id,
        status: pan.status,
        pan_number: panPlain,
        full_name: namePlain,
        photo_base64: photoBase64,
        createdAt: pan.createdAt ?? null,
      };
    } else {
      result.pan = null;
    }

    if (bank) {
      const accPlain = decrypt(bank.account_no);
      const namePlain = decrypt(bank.full_name);
      result.bank = {
        id: bank.id,
        status: bank.status,
        account_no: accPlain,
        full_name: namePlain,
        bank_name: bank.bank_name,
        ifsc_code: bank.ifsc_code,
        createdAt: bank.createdAt ?? null,
      };
    } else {
      result.bank = null;
    }

    return res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Admin: approve/reject KYC record
 * body: { type: 'pan'|'bank', status: 'APPROVED'|'REJECTED' }
 */
export const adminSetKycStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { type, status } = req.body;
    if (!["pan", "bank"].includes(type))
      return res.status(400).json({ message: "Invalid type" });
    if (!["APPROVED", "REJECTED", "PENDING"].includes(status))
      return res.status(400).json({ message: "Invalid status" });

    if (type === "pan") {
      const rec = await prisma.panDetail.updateMany({
        where: { user_id: userId },
        data: { status },
      });
      return res.json({ message: "PAN status updated", count: rec.count });
    } else {
      const rec = await prisma.bankDetail.updateMany({
        where: { user_id: userId },
        data: { status },
      });
      return res.json({ message: "Bank status updated", count: rec.count });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
