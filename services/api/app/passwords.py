"""Password rules for new account passwords, checked before Supabase sees them.

Follows NIST SP 800-63B: a length floor, no composition rules, and a refusal
of passwords that are common or derived from the account's own email.
"""
import re

MIN_LENGTH = 10
MAX_LENGTH = 128

# Frequently breached passwords and patterns students are likely to try.
COMMON = {
    '1234567890', '0123456789', '12345678910', '1234512345', '1111111111', '0000000000',
    'qwertyuiop', 'asdfghjkl1', 'password12', 'password123', 'password1234', 'passw0rd123',
    'iloveyou12', 'iloveyou123', 'abcdefghij', 'abcd123456', 'abc1234567', 'qwerty1234',
    'qwerty12345', '1q2w3e4r5t', 'zaq12wsxcde', 'welcome123', 'letmein123', 'admin12345',
    'india12345', 'india@123', 'maharashtra', 'maharashtra1', 'mumbai1234', 'pune123456',
    'careerquest', 'careerquest1', 'careerquest123', 'student123', 'student1234', 'college123',
}


def password_problem(password, email=''):
    """Return a student-facing reason the password is unsuitable, or None."""
    if len(password) < MIN_LENGTH:
        return f'Use at least {MIN_LENGTH} characters.'
    if len(password) > MAX_LENGTH:
        return f'Use at most {MAX_LENGTH} characters.'
    lowered = password.lower()
    if lowered in COMMON or re.sub(r'[^a-z0-9]', '', lowered) in COMMON:
        return 'This password is too common. Try a short phrase of a few unrelated words.'
    if len(set(lowered)) < 5:
        return 'Use a wider mix of characters; repeated characters are easy to guess.'
    local = email.split('@', 1)[0].lower()
    if len(local) >= 4 and local in lowered:
        return 'Do not include your email name in your password.'
    return None
