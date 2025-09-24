import {
    Button,
    Input,
    Avatar,
    Toast,
    Dialog,
    Form,
} from 'antd-mobile';
import { useState, useRef, useEffect } from 'react';
import {
    AiOutlineCamera,
    AiOutlineCheck,
    AiOutlineLogout,
    AiOutlineTrophy,
    AiOutlineArrowRight,
    AiOutlineLock,
    AiOutlineMail,
    AiOutlineUser,
} from 'react-icons/ai';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.less';
import PageHeader from '../../components/page-header';
import { getUser, updateUserProfile, uploadAvatar, changePassword } from '../../modules/user/api';
import { useUserStore } from '../../modules/user/store';

interface UserProfile {
    nickname: string;
    email: string;
    avatar: string;
}


const Profile = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { logout } = useUserStore();

    const [userProfile, setUserProfile] = useState<UserProfile>({
        nickname: '',
        email: '',
        avatar: ''
    });

    const [editMode, setEditMode] = useState({
        nickname: false,
        email: false
    });

    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [passwordDialogVisible, setPasswordDialogVisible] = useState(false);
    const [passwordForm] = Form.useForm();



    // 获取用户信息
    useEffect(() => {
        const fetchUserProfile = async () => {
            try {
                const response = await getUser();
                const userData = response.data;
                setUserProfile({
                    nickname: userData.nickname || '未设置昵称',
                    email: userData.email || '',
                    avatar: userData.avatar || '/api/placeholder/120/120'
                });


            } catch (error) {
                Toast.show('获取用户信息失败');
                console.error('Failed to fetch user profile:', error);
            } finally {
                setInitialLoading(false);
            }
        };

        fetchUserProfile();
    }, []);

    // 处理头像上传
    const handleAvatarChange = async (files: File[]) => {
        if (files.length > 0) {
            const file = files[0];

            // 检查文件大小 (最大 5MB)
            if (file.size > 5 * 1024 * 1024) {
                Toast.show('图片大小不能超过5MB');
                return;
            }

            // 检查文件类型
            if (!file.type.startsWith('image/')) {
                Toast.show('请选择图片文件');
                return;
            }

            setLoading(true);
            try {
                // 上传头像到服务器
                const uploadResponse = await uploadAvatar(file);
                const uploadResult = uploadResponse.data;

                // 更新用户资料
                await updateUserProfile({ avatar: uploadResult.url });

                setUserProfile(prev => ({
                    ...prev,
                    avatar: uploadResult.url
                }));

                Toast.show('头像更新成功');
            } catch (error) {
                Toast.show('头像上传失败，请重试');
                console.error('Failed to upload avatar:', error);
            } finally {
                setLoading(false);
            }
        }
    };

    // 处理字段编辑
    const handleFieldEdit = (field: 'nickname' | 'email') => {
        setEditMode(prev => ({
            ...prev,
            [field]: true
        }));
    };

    // 保存字段修改
    const handleFieldSave = async (field: 'nickname' | 'email', value: string) => {
        if (!value.trim()) {
            Toast.show(`${field === 'nickname' ? '昵称' : '邮箱'}不能为空`);
            return;
        }

        if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            Toast.show('请输入有效的邮箱地址');
            return;
        }

        setLoading(true);
        try {
            // 调用API更新用户信息
            await updateUserProfile({ [field]: value });

            setUserProfile(prev => ({
                ...prev,
                [field]: value
            }));

            setEditMode(prev => ({
                ...prev,
                [field]: false
            }));

            Toast.show(`${field === 'nickname' ? '昵称' : '邮箱'}更新成功`);
        } catch (error) {
            Toast.show('更新失败，请重试');
            console.error('Failed to update profile:', error);
        } finally {
            setLoading(false);
        }
    };

    // 取消编辑
    const handleFieldCancel = (field: 'nickname' | 'email') => {
        setEditMode(prev => ({
            ...prev,
            [field]: false
        }));
    };

    // 处理退出登录
    const handleLogout = () => {
        Dialog.confirm({
            title: '退出登录',
            content: '确定要退出当前账号吗？',
            confirmText: '确定退出',
            cancelText: '取消',
            onConfirm: () => {
                logout();
                Toast.show('已退出登录');
                navigate('/login', { replace: true });
            }
        });
    };

    // 处理修改密码
    const handleChangePassword = () => {
        setPasswordDialogVisible(true);
    };

    // 确认修改密码
    const handlePasswordSubmit = async () => {
        try {
            const values = await passwordForm.validateFields();

            if (values.newPassword !== values.confirmPassword) {
                Toast.show('两次输入的密码不一致');
                return;
            }

            if (values.newPassword.length < 6) {
                Toast.show('新密码长度不能少于6位');
                return;
            }

            setLoading(true);

            // 调用修改密码的 API
            await changePassword({
                oldPassword: values.oldPassword,
                newPassword: values.newPassword
            });

            Toast.show('密码修改成功');
            setPasswordDialogVisible(false);
            passwordForm.resetFields();
        } catch (error: any) {
            const errorMessage = error?.response?.data?.message || '密码修改失败，请重试';
            Toast.show(errorMessage);
            console.error('Failed to change password:', error);
        } finally {
            setLoading(false);
        }
    };

    // 渲染个人设置功能
    const renderPersonalSettings = () => {
        const personalFeatures = [
            {
                id: 'edit-nickname',
                title: '修改昵称',
                description: userProfile.nickname || '未设置昵称',
                icon: <AiOutlineUser />,
                color: '#2ec4b6',
                onClick: () => handleFieldEdit('nickname')
            },
            {
                id: 'edit-email',
                title: '修改邮箱',
                description: userProfile.email || '未绑定邮箱',
                icon: <AiOutlineMail />,
                color: '#3b82f6',
                onClick: () => handleFieldEdit('email')
            },
            {
                id: 'change-password',
                title: '修改密码',
                description: '更改登录密码',
                icon: <AiOutlineLock />,
                color: '#f59e0b',
                onClick: handleChangePassword
            }
        ];

        return (
            <div className={styles.featuresSection}>
                <h3 className={styles.sectionTitle}>个人设置</h3>
                <div className={styles.features}>
                    {personalFeatures.map((feature) => (
                        <div
                            key={feature.id}
                            className={styles.featureCard}
                            onClick={feature.onClick}
                        >
                            <div
                                className={styles.iconWrapper}
                                style={{ color: feature.color }}
                            >
                                {feature.icon}
                            </div>
                            <div className={styles.cardContent}>
                                <h4>{feature.title}</h4>
                                <p>{feature.description}</p>
                            </div>
                            <AiOutlineArrowRight className={styles.arrow} />
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // 渲染可编辑字段
    const renderEditableField = (
        field: 'nickname' | 'email',
        label: string,
        value: string,
        placeholder: string
    ) => {
        const isEditing = editMode[field];

        if (isEditing) {
            return (
                <div className={styles.editCard}>
                    <div className={styles.editHeader}>
                        <h4>编辑{label}</h4>
                    </div>
                    <div className={styles.editContent}>
                        <Input
                            defaultValue={value}
                            placeholder={placeholder}
                            className={styles.editInput}
                            onEnterPress={(e) => {
                                const inputValue = (e.target as HTMLInputElement).value;
                                handleFieldSave(field, inputValue);
                            }}
                        />
                        <div className={styles.editActions}>
                            <Button
                                color="primary"
                                loading={loading}
                                onClick={(e) => {
                                    const input = e.currentTarget.parentElement?.previousElementSibling as HTMLInputElement;
                                    handleFieldSave(field, input.value);
                                }}
                            >
                                <AiOutlineCheck />
                                保存
                            </Button>
                            <Button
                                fill="outline"
                                onClick={() => handleFieldCancel(field)}
                                disabled={loading}
                            >
                                取消
                            </Button>
                        </div>
                    </div>
                </div>
            );
        }

        return null;
    };

    if (initialLoading) {
        return (
            <div className={styles.profilePage}>
                <PageHeader
                    title="个人中心"
                    onBack={() => navigate(-1)}
                />
                <div className={styles.content}>
                    <div className={styles.loading}>加载中...</div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.profilePage}>
            <PageHeader
                title="个人中心"
                onBack={() => navigate(-1)}
            />

            <div className={styles.content}>
                {/* Hero区域 - 用户信息展示 */}
                <div className={styles.hero}>
                    <div className={styles.avatarContainer}>
                        <Avatar
                            src={userProfile.avatar}
                            className={styles.avatar}
                        />
                        <Button
                            className={styles.avatarButton}
                            fill="none"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <AiOutlineCamera />
                        </Button>
                    </div>
                    <h1>{userProfile.nickname || '未设置昵称'}</h1>
                    <p>{userProfile.email}</p>
                    <div className={styles.userBadge}>
                        <AiOutlineTrophy className={styles.badgeIcon} />
                        <span>初级学习者</span>
                    </div>
                </div>

                {/* 隐藏的文件输入 */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        handleAvatarChange(files);
                    }}
                />


                {/* 个人设置功能 */}
                {renderPersonalSettings()}

                {/* 编辑表单 */}
                {(editMode.nickname || editMode.email) && (
                    <div className={styles.editSection}>
                        {renderEditableField(
                            'nickname',
                            '昵称',
                            userProfile.nickname,
                            '请输入昵称'
                        )}
                        {renderEditableField(
                            'email',
                            '邮箱',
                            userProfile.email,
                            '请输入邮箱地址'
                        )}
                    </div>
                )}

                {/* 退出登录 */}
                <div className={styles.logoutSection}>
                    <div
                        className={styles.logoutCard}
                        onClick={handleLogout}
                    >
                        <div className={styles.iconWrapper} style={{ color: '#f71735' }}>
                            <AiOutlineLogout />
                        </div>
                        <div className={styles.cardContent}>
                            <h4>退出登录</h4>
                            <p>安全退出当前账户</p>
                        </div>
                        <AiOutlineArrowRight className={styles.arrow} />
                    </div>
                </div>
            </div>

            {/* 修改密码弹窗 */}
            <Dialog
                visible={passwordDialogVisible}
                title="修改密码"
                content={
                    <Form
                        form={passwordForm}
                        footer={null}
                        className={styles.passwordForm}
                    >
                        <Form.Item
                            name="oldPassword"
                            label="当前密码"
                            rules={[{ required: true, message: '请输入当前密码' }]}
                        >
                            <Input
                                type="password"
                                placeholder="请输入当前密码"
                            />
                        </Form.Item>
                        <Form.Item
                            name="newPassword"
                            label="新密码"
                            rules={[
                                { required: true, message: '请输入新密码' },
                                { min: 6, message: '密码长度不能少于6位' }
                            ]}
                        >
                            <Input
                                type="password"
                                placeholder="请输入新密码（至少6位）"
                            />
                        </Form.Item>
                        <Form.Item
                            name="confirmPassword"
                            label="确认密码"
                            rules={[{ required: true, message: '请再次输入新密码' }]}
                        >
                            <Input
                                type="password"
                                placeholder="请再次输入新密码"
                            />
                        </Form.Item>
                    </Form>
                }
                actions={[
                    {
                        key: 'cancel',
                        text: '取消',
                        onClick: () => {
                            setPasswordDialogVisible(false);
                            passwordForm.resetFields();
                        }
                    },
                    {
                        key: 'confirm',
                        text: '确认修改',
                        onClick: handlePasswordSubmit
                    }
                ]}
                onClose={() => {
                    setPasswordDialogVisible(false);
                    passwordForm.resetFields();
                }}
            />
        </div>
    );
};

export default Profile;
