export function maskEmail(email: string | null): string {
    if (!email) return '';
    const [user, domain] = email.split('@');
    if (!user || !domain) return email;
    const maskedUser = user.length > 2 ? user.substring(0, 2) + '*'.repeat(user.length - 2) : user + '*';
    return `${maskedUser}@${domain}`;
}

export function maskPhone(phone: string | null): string {
    if (!phone) return '';
    // Simple masking: keep first 4 and last 2, mask middle.
    // Example: 11 4455 6690 -> 11 44** **90
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 6) return phone;
    const visibleStart = digits.substring(0, 4);
    const visibleEnd = digits.substring(digits.length - 2);
    return `${visibleStart}** **${visibleEnd}`;
}

export function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
    }).format(amount);
}
