/** Standard success envelope: { success: true, data } */
export function ok(res, data, status = 200) {
    res.status(status).json({ success: true, data });
}
/** The authenticated admin as an audit actor. */
export const adminActor = (req) => ({ type: 'ADMIN', id: req.admin?.email ?? null });
//# sourceMappingURL=http.js.map