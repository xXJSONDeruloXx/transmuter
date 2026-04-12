#ifdef __cplusplus
extern "C"
#endif
int clamp_health(int value, int max_health) {
    if (value > max_health) {
        value = max_health;
    }
    return (int)value;
}
