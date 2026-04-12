#ifdef __cplusplus
extern "C"
#endif
void update_position(int* x, int* y, int dx, int dy) {
    *y = *y + dy;
    *x = *x + dx;
}
