import rateLimit from 'express-rate-limit'

const authlimit = rateLimit ({
    windowMs: 5 * 60 * 1000, 
    max: 5,
    // only failed attempts count, so legitimate users aren't locked out
    skipSuccessfulRequests: true,
    message: { error: "Too many attempts, please try again later." }
})

export default authlimit