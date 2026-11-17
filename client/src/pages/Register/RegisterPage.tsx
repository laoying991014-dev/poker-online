import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trophy, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { register as registerApi, extractErrorMessage } from '@client/src/api/auth';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { Label } from '@client/src/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@client/src/components/ui/card';
import { Toaster } from '@client/src/components/ui/sonner';

const registerSchema = z
  .object({
    username: z
      .string()
      .min(3, '用户名至少 3 位')
      .max(20, '用户名最多 20 位')
      .regex(/^[a-zA-Z0-9]+$/, '用户名只能包含字母和数字'),
    nickname: z
      .string()
      .min(1, '昵称必填')
      .max(20, '昵称最多 20 位'),
    password: z
      .string()
      .min(6, '密码至少 6 位')
      .max(32, '密码最多 32 位'),
    confirmPassword: z
      .string()
      .min(6, '确认密码至少 6 位')
      .max(32, '确认密码最多 32 位'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

const RegisterPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const redirectTo = searchParams.get('redirect') || '/lobby';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: '',
      nickname: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    try {
      await registerApi({
        username: values.username,
        password: values.password,
        nickname: values.nickname,
      });
      toast.success('注册成功');
      navigate(redirectTo);
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen bg-[#0a1f14] flex items-center justify-center p-4">
      <Toaster />
      <Card className="w-full max-w-4xl bg-[#0d2818] border-[#1a3d26] shadow-2xl overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* 左侧 Logo 区域 */}
          <div className="md:w-1/2 bg-gradient-to-br from-[#0d7a3e] to-[#0a1f14] p-6 md:p-12 flex flex-col justify-center items-center text-center min-h-[180px] md:min-h-0">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl md:rounded-2xl bg-[#f5c518] flex items-center justify-center mb-4 md:mb-6 shadow-lg">
              <Trophy className="w-9 h-9 md:w-12 md:h-12 text-[#0a1f14]" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#f5c518] mb-1 md:mb-2">德州扑克</h1>
            <p className="text-base md:text-lg text-gray-300 mb-0.5">Texas Hold&apos;em</p>
            <p className="text-xs md:text-sm text-gray-400">
              创建账号，开启您的扑克之旅
            </p>
          </div>

          {/* 右侧表单区域 */}
          <div className="md:w-1/2 p-6 md:p-12">
            <CardHeader className="p-0 mb-6">
              <CardTitle className="text-2xl text-white">注册账号</CardTitle>
              <CardDescription className="text-gray-400">
                创建您的玩家账号
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <form
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label
                    htmlFor="username"
                    className="text-gray-300"
                  >
                    用户名
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="3-20位字母或数字"
                    autoComplete="username"
                    className="bg-[#0a1f14] border-[#1a3d26] text-white placeholder:text-gray-500 focus-visible:ring-[#0d7a3e]/40 focus-visible:border-[#0d7a3e]"
                    {...register('username')}
                  />
                  {errors.username && (
                    <p className="text-sm text-red-400">
                      {errors.username.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="nickname"
                    className="text-gray-300"
                  >
                    昵称
                  </Label>
                  <Input
                    id="nickname"
                    type="text"
                    placeholder="请输入昵称"
                    autoComplete="nickname"
                    className="bg-[#0a1f14] border-[#1a3d26] text-white placeholder:text-gray-500 focus-visible:ring-[#0d7a3e]/40 focus-visible:border-[#0d7a3e]"
                    {...register('nickname')}
                  />
                  {errors.nickname && (
                    <p className="text-sm text-red-400">
                      {errors.nickname.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="password"
                    className="text-gray-300"
                  >
                    密码
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="6-32位密码"
                      autoComplete="new-password"
                      className="bg-[#0a1f14] border-[#1a3d26] text-white placeholder:text-gray-500 focus-visible:ring-[#0d7a3e]/40 focus-visible:border-[#0d7a3e] pr-10"
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-sm text-red-400">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="confirmPassword"
                    className="text-gray-300"
                  >
                    确认密码
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="再次输入密码"
                      autoComplete="new-password"
                      className="bg-[#0a1f14] border-[#1a3d26] text-white placeholder:text-gray-500 focus-visible:ring-[#0d7a3e]/40 focus-visible:border-[#0d7a3e] pr-10"
                      {...register('confirmPassword')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      aria-label={showConfirmPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-sm text-red-400">
                      {errors.confirmPassword.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#f5c518] hover:bg-[#d4a914] text-[#0a1f14] font-semibold h-12 rounded-lg border-transparent mt-6 text-base"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      注册中...
                    </>
                  ) : (
                    '注册'
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center text-sm text-gray-400">
                已有账号？
                <Link
                  to="/login"
                  className="text-[#f5c518] hover:text-[#d4a914] font-medium ml-1"
                >
                  立即登录
                </Link>
              </div>
            </CardContent>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default RegisterPage;
