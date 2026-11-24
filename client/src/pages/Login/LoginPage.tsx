import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trophy, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { login, extractErrorMessage } from '@client/src/api/auth';
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

const loginSchema = z.object({
  username: z
    .string()
    .min(3, '用户名至少 3 位')
    .max(20, '用户名最多 20 位')
    .regex(/^[a-zA-Z0-9]+$/, '用户名只能包含字母和数字'),
  password: z
    .string()
    .min(6, '密码至少 6 位')
    .max(32, '密码最多 32 位'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);

  const redirectTo = searchParams.get('redirect') || '/lobby';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    try {
      await login({
        username: values.username,
        password: values.password,
      });
      toast.success('登录成功');
      navigate(redirectTo);
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen bg-[#100d0a] flex items-center justify-center p-4">
      <Toaster />
      <Card className="w-full max-w-4xl bg-[#211810] border-[#6b5136] shadow-2xl overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* 左侧 Logo 区域 */}
          <div className="md:w-1/2 bg-gradient-to-br from-[#72502e] to-[#100d0a] p-6 md:p-12 flex flex-col justify-center items-center text-center min-h-[180px] md:min-h-0">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl md:rounded-2xl bg-[#d9b477] flex items-center justify-center mb-4 md:mb-6 shadow-lg">
              <Trophy className="w-9 h-9 md:w-12 md:h-12 text-[#20160d]" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#f0d39a] mb-1 md:mb-2">德州扑克</h1>
            <p className="text-base md:text-lg text-gray-300 mb-0.5">Texas Hold&apos;em</p>
            <p className="text-xs md:text-sm text-gray-400">
              欢迎回来，登录开始您的牌局
            </p>
          </div>

          {/* 右侧表单区域 */}
          <div className="md:w-1/2 p-6 md:p-12">
            <CardHeader className="p-0 mb-6">
              <CardTitle className="text-2xl text-white">登录账号</CardTitle>
              <CardDescription className="text-gray-400">
                输入您的用户名和密码
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <form
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-5"
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
                    placeholder="请输入用户名"
                    autoComplete="username"
                    className="bg-[#100d0a] border-[#6b5136] text-white placeholder:text-gray-500 focus-visible:ring-[#d9b477]/40 focus-visible:border-[#d9b477]"
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
                    htmlFor="password"
                    className="text-gray-300"
                  >
                    密码
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="请输入密码"
                      autoComplete="current-password"
                      className="bg-[#100d0a] border-[#6b5136] text-white placeholder:text-gray-500 focus-visible:ring-[#d9b477]/40 focus-visible:border-[#d9b477] pr-10"
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

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#d9b477] hover:bg-[#d4a914] text-[#20160d] font-semibold h-12 rounded-lg border-transparent text-base"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      登录中...
                    </>
                  ) : (
                    '登录'
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center text-sm text-gray-400">
                没有账号？
                <Link
                  to="/register"
                  className="text-[#f0d39a] hover:text-[#d4a914] font-medium ml-1"
                >
                  立即注册
                </Link>
              </div>
            </CardContent>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;
