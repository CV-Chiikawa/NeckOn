const { db } = require('../config/db');
const { sendContactMail } = require('../services/contactMailService');

const CATEGORY_MAP = new Map([
  ['bug', { code: 'bug_report', label: 'Error report' }],
  ['bug_report', { code: 'bug_report', label: 'Error report' }],
  ['error', { code: 'bug_report', label: 'Error report' }],
  ['오류 신고', { code: 'bug_report', label: 'Error report' }],
  ['feature', { code: 'feature_request', label: 'Improvement suggestion' }],
  ['feature_request', { code: 'feature_request', label: 'Improvement suggestion' }],
  ['improvement', { code: 'feature_request', label: 'Improvement suggestion' }],
  ['개선 제안', { code: 'feature_request', label: 'Improvement suggestion' }],
  ['other', { code: 'other', label: 'Other inquiry' }],
  ['question', { code: 'other', label: 'Other inquiry' }],
  ['기타 문의', { code: 'other', label: 'Other inquiry' }],
]);

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(row);
    });
  });
}

function normalizeCategory(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  return CATEGORY_MAP.get(value.trim()) || null;
}

exports.createContact = async (req, res) => {
  const category = normalizeCategory(req.body.category || req.body.type);
  const content =
    req.body.content !== undefined ? String(req.body.content).trim() : '';
  const files = req.files || [];

  if (!category) {
    return res.status(400).json({
      message: 'category is required. Allowed values: bug_report, feature_request, other.',
    });
  }

  if (!content) {
    return res.status(400).json({
      message: 'content is required.',
    });
  }

  if (content.length > 5000) {
    return res.status(400).json({
      message: 'content must be 5000 characters or fewer.',
    });
  }

  if (files.length > 5) {
    return res.status(400).json({
      message: 'Up to 5 attachments are allowed.',
    });
  }

  try {
    const user = await get(
      `SELECT id, username, email, nickname
       FROM Users
       WHERE id = ?`,
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({
        message: 'User not found.',
      });
    }

    const result = await sendContactMail({
      user,
      category,
      content,
      attachments: files,
    });

    if (!result.delivered && result.reason === 'not_configured') {
      return res.status(503).json({
        message:
          'Contact mail is not configured. Set CONTACT_MAIL_TO and SMTP mail environment variables.',
      });
    }

    return res.status(201).json({
      message: 'Contact inquiry sent successfully.',
      data: {
        category: category.code,
        reply_email: user.email,
        attachment_count: files.length,
        message_id: result.messageId,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to send contact inquiry.',
      error: error.message,
    });
  }
};
