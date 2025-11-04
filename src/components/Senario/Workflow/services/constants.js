import { DSLC_BASE_URL } from '../../../../config/base_url';
const constants = 
{
    API: {
        FEEDBACK_API_URL: DSLC_BASE_URL + '/reflection',
        BEHAVIOR_API_URL: DSLC_BASE_URL + '/actions',
        GENERATE_API_URL: DSLC_BASE_URL + '/generate',
    },

    // 延迟时间常量
    DELAY: {
        OPERATION_BUFFER_DELAY: 10,
        API_REQUEST_DELAY: 10,
        FEEDBACK_CLEAR_DELAY: 10
    },

    // UI相关常量
    UI: {
        DEFAULT_COUNTDOWN: 5
    }
};

export default constants;