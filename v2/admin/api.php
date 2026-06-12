<?php
/* ============================================================
   Da'am CMS — Server backend (used when the site is hosted on
   a normal web server instead of GitHub Pages).

   ⚠️ قبل التشغيل على السيرفر الجديد:
   1) غيّر كلمة المرور في السطر التالي.
   2) تأكد أن مجلد الموقع قابل للكتابة (الصفحات + v2/uploads).
   لا حاجة لأي إعداد آخر — لوحة التحكم تكتشف السيرفر تلقائياً.
   ============================================================ */

$PASSWORD = 'admin123';   // ← غيّر كلمة المرور هنا

/* ------------------------------------------------------------ */
session_start();
header('Content-Type: application/json; charset=utf-8');

// Site root = two levels above this file (…/v2/admin/api.php → site root)
$ROOT = realpath(__DIR__ . '/../..');

function out($data) { echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }
function fail($msg, $code = 400) { http_response_code($code); out(['ok' => false, 'error' => $msg]); }

$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) fail('bad request');
$action = isset($in['action']) ? $in['action'] : '';

/* ---------- login ---------- */
if ($action === 'login') {
    $pwd = isset($in['password']) ? $in['password'] : '';
    if (!hash_equals($PASSWORD, $pwd)) fail('wrong password', 401);
    $_SESSION['daam_auth'] = true;
    out(['ok' => true]);
}

if (empty($_SESSION['daam_auth'])) fail('not authenticated', 401);

/* ---------- path safety ----------
   Only files inside the site root, only .html / .json,
   and never inside the admin folder itself. */
function resolve_path($ROOT, $rel) {
    $rel = str_replace('\\', '/', $rel);
    if ($rel === '' || strpos($rel, '..') !== false || $rel[0] === '/') return null;
    if (!preg_match('/\.(html|json)$/i', $rel)) return null;
    if (stripos($rel, 'v2/admin/') === 0 || stripos($rel, 'admin/') === 0) return null; // never touch the admin itself
    $full = $ROOT . '/' . $rel;
    $dir  = realpath(dirname($full));
    if ($dir === false || strpos($dir, $ROOT) !== 0) return null;
    return $full;
}

/* ---------- get file ---------- */
if ($action === 'get') {
    $full = resolve_path($ROOT, isset($in['path']) ? $in['path'] : '');
    if (!$full) fail('invalid path');
    if (!file_exists($full)) fail('not found', 404);
    out(['ok' => true, 'content' => file_get_contents($full)]);
}

/* ---------- save file ---------- */
if ($action === 'save') {
    $full = resolve_path($ROOT, isset($in['path']) ? $in['path'] : '');
    if (!$full) fail('invalid path');
    $content = base64_decode(isset($in['content']) ? $in['content'] : '', true);
    if ($content === false) fail('bad content');
    // one-time backup of the previous version
    if (file_exists($full)) @copy($full, $full . '.bak');
    if (file_put_contents($full, $content) === false) fail('write failed', 500);
    out(['ok' => true]);
}

/* ---------- upload image ---------- */
if ($action === 'upload') {
    $name = preg_replace('/[^a-zA-Z0-9._-]/', '_', isset($in['name']) ? $in['name'] : 'img');
    if (!preg_match('/\.(jpe?g|png|gif|webp|svg)$/i', $name)) $name .= '.png';
    $data = base64_decode(isset($in['data']) ? $in['data'] : '', true);
    if ($data === false || strlen($data) < 10) fail('bad image');
    if (strlen($data) > 8 * 1024 * 1024) fail('image too large (max 8MB)');
    $dir = $ROOT . '/v2/uploads';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $file = time() . '_' . $name;
    if (file_put_contents($dir . '/' . $file, $data) === false) fail('write failed', 500);
    out(['ok' => true, 'path' => '/v2/uploads/' . $file]);
}

fail('unknown action');
